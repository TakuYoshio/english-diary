// ビルド工程もテストランナーも無いので、実ブラウザでアプリを起動し
// 「コンソールエラーが出ないこと」と主要タブが描画されることだけを見る軽いスモークテスト。
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8931';
const stub = readFileSync(new URL('./supabase-stub.js', import.meta.url), 'utf8');

// CHROMIUM_PATH が指定されていればそれを使う（CIではplaywright同梱版が使われる）
const preinstalled = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(preinstalled ? { executablePath: preinstalled } : {});
const page = await browser.newPage();
// テストではService Workerを無効化する。有効だと前回実行時のapp.jsが
// キャッシュから配られ、直したはずの挙動が古いままテストされてしまう。
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
});
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

// 外部ネットワーク（フォント・画像生成）は遮断し、supabase-js だけスタブに差し替える。
// 本体は vendor/ に同梱しているので、同一オリジンでも差し替え対象にする。
await page.route('**/*', route => {
  const url = route.request().url();
  if (/supabase-js/.test(url)) {
    return route.fulfill({ contentType: 'application/javascript', body: stub });
  }
  if (url.startsWith(BASE)) return route.continue();
  return route.abort();
});

const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail.push(name);
};

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const a = document.getElementById('app');
  return a && getComputedStyle(a).display !== 'none';
}, { timeout: 10000 });

check('アプリ本体が表示される', await page.locator('#app').isVisible());
check('ログイン画面は隠れている', !(await page.locator('#setup-screen').isVisible()));

// 日付がローカル暦日であること（UTC変換で前日にならない）
const dateOk = await page.evaluate(() => todayISO() === new Date().toLocaleDateString('sv-SE'));
check('todayISO() がローカル暦日を返す', dateOk);

// 各タブが例外なく描画されること
for (const [tab, sel] of [
  ['home', '#home-missions .home-mission-card'],
  ['diary', '#tab-diary'],
  ['entries', '#tab-entries'],
  ['vocab', '.vocab-row'],
  ['quiz', '#tab-quiz'],
]) {
  await page.evaluate(t => switchTab(t), tab);
  await page.waitForTimeout(300);
  check(`${tab} タブが描画される`, await page.locator(sel).first().isVisible().catch(() => false));
}

// 単語帳のimage_urlが属性に未エスケープで入っていないこと（XSS回帰テスト）
await page.evaluate(() => {
  allVocab[0].image_url = 'x" onerror="window.__xss=1';
  filterAndRenderVocab();
});
await page.waitForTimeout(200);
check('image_url が属性からエスケープされている', !(await page.evaluate(() => window.__xss === 1)));

// テストタブを開き直しても出題が巻き戻らないこと
await page.evaluate(() => switchTab('quiz'));
await page.waitForTimeout(200);
const firstWord = await page.locator('#quiz-word').textContent();
await page.evaluate(() => { switchTab('home'); switchTab('quiz'); });
await page.waitForTimeout(200);
check('テストタブ再訪で出題が巻き戻らない',
  firstWord === await page.locator('#quiz-word').textContent());

// ── アクセシビリティの回帰テスト ────────────────────────────────────────
// ラベルの関連付け
const unlabelled = await page.evaluate(() =>
  [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea, select')]
    .filter(el => !el.labels?.length && !el.getAttribute('aria-label'))
    .map(el => el.outerHTML.slice(0, 90)));
check('ラベルの無い入力欄が無い', unlabelled.length === 0, unlabelled.join(', '));

// モーダル: Escapeで閉じる・開いたらフォーカスが中に入る・閉じたら戻る
await page.evaluate(() => switchTab('home'));
await page.locator('#home-streak').focus();
await page.evaluate(() => openMascotModal());
await page.waitForTimeout(200);
const focusInside = await page.evaluate(() =>
  document.getElementById('mascot-modal').contains(document.activeElement));
check('モーダルを開くとフォーカスが中に移る', focusInside);
check('モーダルに aria-modal が付く',
  await page.getAttribute('#mascot-modal', 'aria-modal') === 'true');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Escapeでモーダルが閉じる', !(await page.locator('#mascot-modal').isVisible()));
check('閉じたら元の要素にフォーカスが戻る',
  await page.evaluate(() => document.activeElement?.id === 'home-streak'));

// シャドーイング未達のマイクボタンはキーボードからも押せないこと
const micGated = await page.evaluate(() => {
  goToDiaryStep(6); resetShadowingGate();
  return document.getElementById('mic-btn').disabled;
});
check('シャドーイング未達のマイクがdisabled', micGated);

// トーストが読み上げ対象になっていること
await page.evaluate(() => showToast('test', 'info'));
await page.waitForTimeout(100);
check('トーストに aria-live がある',
  await page.getAttribute('#toast-container', 'aria-live') === 'polite');

// ── パフォーマンス回帰 ──────────────────────────────────────────────────
// シャドーイングは最大50回。1回ごとに8KBのSVGを組み直していたので、
// SVG要素が作り直されていないこと（data属性の差し替えで済むこと）を見る。
const svgRebuilds = await page.evaluate(() => {
  goToDiaryStep(6);
  resetShadowingGate();
  const slot = document.getElementById('step6-mascot');
  const before = slot.querySelector('svg');
  for (let i = 0; i < 20; i++) registerShadowingRep();
  const after = slot.querySelector('svg');
  return { same: before === after, mood: slot.querySelector('.kotora-wrap')?.dataset.mood };
});
check('シャドーイング中にSVGを作り直さない', svgRebuilds.same);
check('それでもmoodは更新される', svgRebuilds.mood === 'excited' || svgRebuilds.mood === 'delighted',
  `mood=${svgRebuilds.mood}`);

// ── Phase 3: Word Garden（SRS可視化＋苦手特訓） ──────────────────────────
await page.evaluate(() => switchTab('vocab'));
await page.waitForTimeout(400);

check('単語行に成長アイコンが出る',
  await page.locator('.vocab-row .v-stage').first().isVisible().catch(() => false));
check('単語帳ヘッダーにサマリーチップが出る',
  await page.locator('#vocab-garden .stat-chip').first().isVisible().catch(() => false));
check('苦手単語のチップが出る',
  await page.locator('#vocab-garden .chip-weak').isVisible().catch(() => false));

// 成長アイコンを足しても行が縦積みに崩れないこと（テキストセルが同じ行に並ぶ）
const rowIntact = await page.evaluate(() => {
  const row = document.querySelector('.vocab-row');
  if (!row) return false;
  const en = row.querySelector('.v-en'), stage = row.querySelector('.v-stage');
  if (!en || !stage) return false;
  // 同じ行にあれば垂直方向の中心が近い
  return Math.abs(en.getBoundingClientRect().top - stage.getBoundingClientRect().top) < 30;
});
check('成長アイコンを足しても行レイアウトが崩れない', rowIntact);

await page.evaluate(() => switchTab('quiz'));
await page.waitForTimeout(500);
check('苦手トグルが表示される',
  await page.locator('#weak-toggle-wrap').isVisible().catch(() => false));

const weakFiltered = await page.evaluate(async () => {
  toggleWeakOnly();
  await new Promise(r => setTimeout(r, 400));
  // 苦手だけに絞られたら、出題プールは苦手単語のidのみになる
  const ids = [...queue.map(c => c.v.id), ...(currentCard ? [currentCard.v.id] : [])];
  const weakIds = weakVocab(allVocab).map(v => v.id);
  const onlyWeak = ids.length > 0 && ids.every(id => weakIds.includes(id));
  toggleWeakOnly();
  await new Promise(r => setTimeout(r, 400));
  return { onlyWeak, count: ids.length, weakCount: weakIds.length };
});
check('苦手トグルで出題が苦手単語だけに絞られる', weakFiltered.onlyWeak,
  `出題${weakFiltered.count}件 / 苦手${weakFiltered.weakCount}件`);

// 苦手が0件ならトグル自体が消えること
const hiddenWhenNone = await page.evaluate(async () => {
  const backup = allVocab.map(v => ({ ...v }));
  allVocab.forEach(v => { v.wrong = 0; v.correct = 5; });
  renderWeakToggle();
  const hidden = getComputedStyle(document.getElementById('weak-toggle-wrap')).display === 'none';
  allVocab.length = 0; allVocab.push(...backup);
  renderWeakToggle();
  return hidden;
});
check('苦手が0件ならトグルを出さない', hiddenWhenNone);

// ── Phase 3: 日記から復習 ────────────────────────────────────────────────
await page.evaluate(() => switchQuizMode('diary'));
await page.waitForTimeout(600);
check('日記クイズが出題を生成する',
  await page.locator('#diary-quiz-area').isVisible().catch(() => false));
check('出題元の日付が表示される',
  !!(await page.locator('#dq-source').textContent())?.trim());

const dqJudged = await page.evaluate(async () => {
  // 正解を直接入れて判定させる（穴埋め・並べ替えどちらでも）
  if (!dqCard) return { skipped: true };
  const kind = dqCard.kind;
  if (kind === 'cloze') {
    document.getElementById('dq-input').value = dqCard.answer;
  } else {
    // バンクから正しい順に積む
    dqCard.words.forEach(w => {
      const bank = document.getElementById('dq-bank');
      const idx = bank._words.findIndex((bw, i) =>
        bw === w && !bank.querySelector(`[data-bank="${i}"]`).disabled);
      if (idx >= 0) dqPickWord(idx);
    });
  }
  await checkDiaryAnswer();
  await new Promise(r => setTimeout(r, 300));
  const banner = document.getElementById('dq-banner');
  return { kind, ok: banner.className.includes('result-ok'), recall: getComputedStyle(document.getElementById('dq-recall')).display !== 'none' };
});
check('日記クイズが正解を判定する', dqJudged.skipped || dqJudged.ok, `形式=${dqJudged.kind}`);
check('正解すると思い出しカードが出る', dqJudged.skipped || dqJudged.recall);

// ── Phase 3: コトラの週報 ────────────────────────────────────────────────
await page.evaluate(() => switchTab('home'));
await page.waitForTimeout(300);
await page.evaluate(() => openWeeklyReport());
await page.waitForTimeout(500);
check('週報モーダルが開く', await page.locator('#weekly-modal').isVisible().catch(() => false));
check('週報に数字カードが出る',
  await page.locator('#weekly-modal .stat-card-big').first().isVisible().catch(() => false));
check('週報モーダルにフォーカスが移る',
  await page.evaluate(() => document.getElementById('weekly-modal').contains(document.activeElement)));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('週報モーダルがEscapeで閉じる', !(await page.locator('#weekly-modal').isVisible()));

// ── Phase 4: 英語でひとりごと ────────────────────────────────────────────
// SpeechRecognition と Gemini 呼び出しをスタブして、セッション開始→発話→
// 終了→レポート描画までを実ブラウザで通す。
await page.evaluate(() => {
  class FakeSR {
    constructor() { window.__sr = this; this.onresult = this.onerror = this.onend = null; }
    start() { window.__srStarts = (window.__srStarts || 0) + 1; }
    stop() {}
    say(text) {
      const alt = { transcript: text, confidence: 0.9 };
      const r = [alt]; r.isFinal = true; r.length = 1;
      this.onresult({ resultIndex: 0, results: Object.assign([r], { length: 1 }) });
    }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
  // レポート生成はAIを呼ぶのでスタブに差し替える
  window.callGemini = async () => JSON.stringify({
    summary_jp: 'よく話せていました。',
    stats: { fluency_score: 72, variety_score: 65, accuracy_score: 80, used_vocab: ['café'] },
    good_expressions: [{ text: 'I went to a cafe', why_jp: '過去形が自然です' }],
    corrections: [
      { before: 'I go store', after: 'I went to the store', explanation_jp: '過去形に', category: 'grammar', confidence: 'high' },
      { before: 'a apple', after: 'an apple', explanation_jp: '母音の前はan', category: 'grammar', confidence: 'low' },
    ],
    upgrade_suggestions: [{ you_said: 'very good', native_way: 'really solid' }],
    suggested_vocab: [{ en: 'errand', jp: '用事', note: '' }],
    next_time_focus_jp: '過去形を意識してみよう',
  });
});

await page.evaluate(() => switchTab('solo'));
await page.waitForTimeout(400);
check('独り言の設定画面が出る', await page.locator('#solo-setup-view').isVisible().catch(() => false));
check('時間の選択チップが出る',
  (await page.locator('#solo-duration-chips .solo-chip').count()) === 4);
check('コトラと会話は準備中で無効',
  await page.locator('#solo-mode-talk').isDisabled().catch(() => false));

await page.evaluate(() => soloStartSession());
await page.waitForTimeout(500);
check('セッション画面に切り替わる', await page.locator('#solo-live-view').isVisible().catch(() => false));
check('お題が表示される', !!(await page.locator('#solo-prompt-en').textContent())?.trim());
check('マイク状態チップが「聞いています」',
  (await page.locator('#solo-mic-chip').textContent())?.includes('聞い'));

// 発話を注入してカウンタが動くこと
await page.evaluate(() => {
  window.__sr.say('I went to a cafe this morning and it was really nice');
});
await page.waitForTimeout(400);
check('語数カウンタが増える',
  Number(await page.locator('#solo-words').textContent()) >= 11);
check('字幕に発話が出る',
  (await page.locator('#solo-transcript').textContent())?.includes('cafe'));

// 認識が落ちても自動再開すること
const restarted = await page.evaluate(async () => {
  const before = window.__srStarts;
  window.__sr.onend();
  await new Promise(r => setTimeout(r, 600));
  return { before, after: window.__srStarts, state: soloSession.mic.state };
});
check('認識が切れても自動再開する', restarted.after > restarted.before,
  `${restarted.before}→${restarted.after} state=${restarted.state}`);

// 中断してもlocalStorageに残ること
const draftSaved = await page.evaluate(() => {
  soloSaveDraft();
  const raw = localStorage.getItem('soloDraft');
  return !!(raw && JSON.parse(raw).segments.length);
});
check('途中経過がlocalStorageに保存される', draftSaved);

// タイピング入力
await page.evaluate(() => {
  soloToggleTyping(true);
  document.getElementById('solo-typing-input').value = 'I also typed this sentence here';
  soloCommitTyping();
});
await page.waitForTimeout(300);
check('タイピング入力も蓄積される',
  (await page.evaluate(() => soloSession.mic.transcript())).includes('typed this'));

// 終了してレポートまで。
// 60秒・40語に満たないとAIを呼ばない仕様なので、条件を満たしてから終了させる。
await page.evaluate(async () => {
  window.__sr.say('one two three four five six seven eight nine ten eleven twelve '
    + 'thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty '
    + 'twentyone twentytwo twentythree twentyfour twentyfive twentysix');
  soloSession.startedAt = Date.now() - 90000;  // 90秒話したことにする
  await soloFinishSession();
});
await page.waitForTimeout(1200);
check('レポート画面が出る', await page.locator('#solo-report-view').isVisible().catch(() => false));
check('スコアメーターが出る',
  (await page.locator('#solo-report-body .solo-meter').count()) === 3);
check('聞き間違いの但し書きが出る',
  await page.locator('.solo-disclaimer').isVisible().catch(() => false));
check('confidence:low は折りたたまれる',
  (await page.locator('.solo-maybe').count()) === 1);
check('レポート生成後にドラフトが消える',
  await page.evaluate(() => !localStorage.getItem('soloDraft')));

// 単語帳への一括追加
await page.evaluate(() => soloAddSuggestedVocab());
await page.waitForTimeout(400);
check('推奨単語を単語帳に追加できる',
  await page.evaluate(() => allVocab.some(v => v.en === 'errand')));

// 短すぎるセッションはAIを呼ばない
const shortSession = await page.evaluate(async () => {
  switchTab('solo');
  await new Promise(r => setTimeout(r, 200));
  let called = false;
  const saved = window.callGemini;
  window.callGemini = async () => { called = true; return '{}'; };
  soloStartSession();
  await new Promise(r => setTimeout(r, 200));
  await soloFinishSession();
  await new Promise(r => setTimeout(r, 300));
  window.callGemini = saved;
  return { called, shown: document.querySelector('.solo-too-short') !== null };
});
check('短すぎるセッションはAIを呼ばない', !shortSession.called);
check('短すぎるときは専用の案内を出す', shortSession.shown);

// ── Phase 4 仕上げ: 進捗システムへの反映 ────────────────────────────────
await page.evaluate(() => switchTab('entries'));
await page.waitForTimeout(300);
await page.evaluate(() => switchEntriesView('speaking'));
await page.waitForTimeout(500);
// 先行するテストでセッションを追加しているので、件数は「2件以上」で見る
check('履歴にスピーキング一覧が出る',
  (await page.locator('#entries-speaking .solo-list-card').count()) >= 2);
check('レポートが無いセッションはその旨を出す',
  await page.locator('.solo-list-failed').first().isVisible().catch(() => false));

// 一覧からタップして過去のレポートを開く
await page.locator('#entries-speaking .solo-list-card').first().click();
await page.waitForTimeout(600);
check('一覧から過去のレポートを開ける',
  await page.locator('#solo-report-view').isVisible().catch(() => false));
check('過去レポートの中身が描画される',
  (await page.locator('#solo-report-body .solo-meter').count()) === 3);

// XPに発話分数が乗っていること
const xpParts = await page.evaluate(() => {
  const withSolo = computeProgressStats().xp;
  const saved = soloMeta.slice();
  soloMeta.length = 0;
  const withoutSolo = computeProgressStats().xp;
  soloMeta.push(...saved);
  return { withSolo, withoutSolo, minutes: soloTotalMinutes(saved) };
});
check('XPに発話分数が反映される',
  xpParts.withSolo - xpParts.withoutSolo === xpParts.minutes * 2,
  `差分${xpParts.withSolo - xpParts.withoutSolo} / ${xpParts.minutes}分`);

// カレンダーに2つ目のドット
await page.evaluate(() => { switchTab('entries'); switchEntriesView('calendar'); });
await page.waitForTimeout(500);
check('カレンダーに話した日のドットが出る',
  (await page.locator('.cal-dot-solo').count()) >= 1);
// 話しただけの日は押せそうに見せない
const soloOnlyCursor = await page.evaluate(() => {
  const cell = document.querySelector('.cal-cell.cal-has-solo');
  return cell ? getComputedStyle(cell).cursor : 'none';
});
check('日記が無い日はポインタにしない', soloOnlyCursor !== 'pointer', `cursor=${soloOnlyCursor}`);

const ignorable = /favicon|ERR_FAILED|net::ERR|Failed to load resource/i;
const real = errors.filter(e => !ignorable.test(e));
check('コンソールエラーが無い', real.length === 0, real.join(' | '));

await browser.close();
if (fail.length) { console.error(`\n${fail.length} 件失敗`); process.exit(1); }
console.log('\nすべて通過');
