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

// 外部ネットワーク（フォント・写真）は遮断し、supabase-js だけスタブに差し替える。
// 本体は vendor/ に同梱しているので、同一オリジンでも差し替え対象にする。
// Worker（写真検索の中継）はテストから応答を差し替えられるようにしておく。
let workerCalls = [];
let photoReply = null;      // null のあいだは失敗させる（写真が取れない環境の再現）
let photoImageRequests = 0; // 写真CDNへ実際に出たリクエスト数

await page.route('**/*', route => {
  const url = route.request().url();
  if (/supabase-js/.test(url)) {
    return route.fulfill({ contentType: 'application/javascript', body: stub });
  }
  if (/workers\.dev/.test(url)) {
    workerCalls.push(JSON.parse(route.request().postData() || '{}'));
    if (!photoReply) return route.abort();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ photos: photoReply }) });
  }
  if (/images\.pexels\.com/.test(url)) { photoImageRequests++; return route.abort(); }
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

// ── 単語カードの写真 ──────────────────────────────────────────────────────
// 写真は飾りなので、取れなくても単語の記録は通らなければならない。
// 以前はイラスト用の列ひとつで、単語の追加と日記の保存の両方が落ちていた。

// 挿入そのものに画像の列が出てこないこと（＝保存が画像に依存しないこと）
const insertNoImage = await page.evaluate(() => {
  const row = vocabRow({ en: 'ordinary', jp: 'ふつう' }, { includeDefaults: true });
  return Object.keys(row);
});
check('単語の挿入に画像の列が含まれない',
  !insertNoImage.includes('image_url') && !insertNoImage.includes('image_credit'),
  insertNoImage.join(','));

// 写真の取得が失敗する環境（photoReply = null のまま）で単語を追加できること
photoReply = null;
const photoFailAdd = await page.evaluate(async () => {
  switchTab('vocab');
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('v-en').value = 'resilient';
  document.getElementById('v-jp').value = 'しぶとい';
  document.getElementById('v-note').value = '';
  await addVocab();
  await _vocabPhotoWork;
  return allVocab.some(v => v.en === 'resilient');
});
check('写真の取得が失敗しても単語帳から追加できる', photoFailAdd);

const photoFailBatch = await page.evaluate(async () => {
  const batch = await addVocabBatch([{ en: 'persistence', jp: '粘り強さ', note: '' }]);
  await _vocabPhotoWork;
  return batch.length === 1;
});
check('写真の取得が失敗しても一括追加が通る（日記の保存経路）', photoFailBatch);

// 写真が無い行は頭文字のタイルを出し、写真CDNへは一切出ない
photoImageRequests = 0;
const fallback = await page.evaluate(async () => {
  allVocab.forEach(v => { v.image_url = null; v.image_credit = null; });
  filterAndRenderVocab();
  await new Promise(r => setTimeout(r, 100));
  const row = document.querySelector('.vocab-row');
  return {
    hasFallback: !!row.querySelector('.v-thumb-fallback'),
    hasImg: !!row.querySelector('img.v-thumb'),
    initial: row.querySelector('.v-thumb-fallback')?.textContent || '',
    en: row.querySelector('.v-en')?.textContent || '',
    label: row.querySelector('.v-thumb-btn')?.getAttribute('aria-label') || '',
  };
});
check('写真が無い行は頭文字タイルを出す', fallback.hasFallback && !fallback.hasImg);
check('写真が無い行から写真CDNへリクエストを出さない', photoImageRequests === 0,
  `${photoImageRequests} 件`);
check('サムネイルのボタンに単語を含む読み上げ名が付いている',
  fallback.label.includes(fallback.en) && fallback.label.length > fallback.en.length,
  `${fallback.label} / ${fallback.en}`);
check('頭文字タイルに単語の1文字目が出る',
  fallback.initial === fallback.en.slice(0, 1).toUpperCase(),
  `${fallback.initial} / ${fallback.en}`);

// 穴埋めは1回の描画につきWorker呼び出し1回に収まる
workerCalls = [];
const backfillCalls = await page.evaluate(async () => {
  _photoTried.clear();
  allVocab.forEach(v => { v.image_url = null; });
  backfillVocabPhotos();
  await _vocabPhotoWork;
  return true;
});
check('穴埋めは1回の描画でWorker呼び出し1回', backfillCalls && workerCalls.length === 1,
  `${workerCalls.length} 回`);
check('穴埋めのリクエストは action:photo と語の配列を送る',
  workerCalls[0]?.action === 'photo' && Array.isArray(workerCalls[0]?.words)
  && workerCalls[0].words.length <= 20,
  JSON.stringify(workerCalls[0] || {}).slice(0, 120));

// 写真が取れたら image_url と image_credit が保存される。
// 撮影者名とリンクには、外部由来の危険な値を混ぜて渡す。
photoReply = {
  grateful: [
    { name: 'Jane "quote" Doe', page: 'https://www.pexels.com/photo/1/',
      small: 'https://images.pexels.com/photos/1/t.jpg', large: 'https://images.pexels.com/photos/1/m.jpg' },
    { name: 'John Roe', page: 'javascript:alert(1)',
      small: 'https://images.pexels.com/photos/2/t.jpg', large: 'https://images.pexels.com/photos/2/m.jpg' },
  ],
};
const saved = await page.evaluate(async () => {
  _photoTried.clear();
  window.__stubClearPatches();
  const target = allVocab.find(v => v.en === 'grateful');
  target.image_url = null;
  target.image_credit = null;
  await queueVocabPhotos([{ id: target.id, en: 'grateful' }]);
  const row = allVocab.find(v => v.en === 'grateful');
  return { url: row.image_url, credit: row.image_credit, patches: window.__stubPatches().length };
});
check('写真が取れたら image_url が保存される', saved.url === 'https://images.pexels.com/photos/1/t.jpg', String(saved.url));
check('撮影者クレジットも保存される',
  saved.credit && saved.credit.name === 'Jane "quote" Doe' && saved.credit.source === 'pexels',
  JSON.stringify(saved.credit));

// 写真モーダル: 撮影者名とPexelsへのリンクが出る（規約上の義務）
const modal = await page.evaluate(async () => {
  const target = allVocab.find(v => v.en === 'grateful');
  await openVocabPhoto(target.id);
  const creditEl = document.getElementById('vocab-photo-credit');
  const link = creditEl.querySelector('a');
  return {
    visible: getComputedStyle(document.getElementById('vocab-photo-modal')).display !== 'none',
    word: document.getElementById('vocab-photo-word').textContent,
    creditText: creditEl.textContent,
    linkHref: link ? link.getAttribute('href') : '',
    linkRel: link ? link.getAttribute('rel') : '',
    hasPexelsLink: [...creditEl.querySelectorAll('a')].some(a => a.href.includes('pexels.com')),
    nextEnabled: !document.getElementById('vocab-photo-next').disabled,
    imgSrc: document.querySelector('.vocab-photo-img')?.getAttribute('src') || '',
    xss: window.__xss === 1,
  };
});
check('写真モーダルが開く', modal.visible && modal.word === 'grateful');
check('撮影者名が表示される', modal.creditText.includes('Jane "quote" Doe'), modal.creditText);
check('撮影者名を属性に入れてもXSSにならない', !modal.xss);
check('Pexelsへのリンクがある', modal.hasPexelsLink);
check('外部リンクに rel=noopener noreferrer が付く', /noopener/.test(modal.linkRel) && /noreferrer/.test(modal.linkRel), modal.linkRel);
check('モーダルは大きい方の写真を使う', modal.imgSrc === 'https://images.pexels.com/photos/1/m.jpg', modal.imgSrc);
check('別の写真にするボタンが押せる', modal.nextEnabled);

// 「別の写真にする」で次の候補に進む。javascript: のリンクは空に落とされている。
const cycled = await page.evaluate(async () => {
  await cycleVocabPhoto();
  const row = allVocab.find(v => v.en === 'grateful');
  const link = document.getElementById('vocab-photo-credit').querySelector('a');
  return { url: row.image_url, href: link ? link.getAttribute('href') : '' };
});
check('別の写真にすると次の候補が保存される', cycled.url === 'https://images.pexels.com/photos/2/t.jpg', String(cycled.url));
check('候補のjavascript:リンクはPexelsのトップに落とされる', cycled.href === 'https://www.pexels.com/', cycled.href);

// 「写真を外す」は空文字。nullに戻すと穴埋めが拾い直してしまう。
const cleared = await page.evaluate(async () => {
  const target = allVocab.find(v => v.en === 'grateful');
  await openVocabPhoto(target.id);
  await clearVocabPhoto();
  const row = allVocab.find(v => v.en === 'grateful');
  return { url: row.image_url, needs: needsVocabPhoto(row) };
});
check('写真を外すと空文字になる', cleared.url === '', JSON.stringify(cleared.url));
check('外した写真は穴埋めが拾い直さない', cleared.needs === false);

// ── 回帰: 画像の列が無い環境でも単語を記録できること ──────────────────────
for (const col of ['image_url', 'image_credit']) {
  const noCol = await page.evaluate(async (dropped) => {
    window.__stubDropColumn('vocab', dropped);
    _vocabImageColumnMissing = false;
    warnMissingImageColumn._warned = false;

    document.getElementById('v-en').value = `word-${dropped}`;
    document.getElementById('v-jp').value = 'てすと';
    document.getElementById('v-note').value = '';
    await addVocab();
    await _vocabPhotoWork;
    const added = allVocab.some(v => v.en === `word-${dropped}`);

    const batch = await addVocabBatch([{ en: `batch-${dropped}`, jp: 'てすと', note: '' }]);
    await _vocabPhotoWork;

    window.__stubRestoreColumns();
    return { added, batched: batch.length === 1 };
  }, col);
  check(`${col} 列が無くても単語帳から追加できる`, noCol.added);
  check(`${col} 列が無くても一括追加が通る（日記の保存経路）`, noCol.batched);
}

// 画像の列が無いと分かったら、穴埋め自体を止める（無駄な往復を出さない）
workerCalls = [];
const stopsBackfill = await page.evaluate(async () => {
  _vocabImageColumnMissing = true;
  _photoTried.clear();
  allVocab.forEach(v => { v.image_url = null; });
  backfillVocabPhotos();
  await _vocabPhotoWork;
  _vocabImageColumnMissing = false;
  return true;
});
check('画像の列が無い環境では穴埋めをしない', stopsBackfill && workerCalls.length === 0,
  `${workerCalls.length} 回`);

// ── メモの改行 ────────────────────────────────────────────────────────────
// 日記Step3のメモは元から textarea だったので、改行入りのメモは保存されていたが、
// 単語帳では1行に潰れて表示されていた。入力側と表示側の両方を直している。
const noteMultiline = await page.evaluate(async () => {
  const el = document.getElementById('v-note');
  const tag = el.tagName;
  document.getElementById('v-en').value = 'multiline';
  document.getElementById('v-jp').value = 'かいぎょう';
  el.value = '一行目\n二行目';
  await addVocab();
  await _vocabPhotoWork;
  const row = allVocab.find(v => v.en === 'multiline');
  const noteEl = [...document.querySelectorAll('.vocab-row')]
    .find(r => r.querySelector('.v-en')?.textContent === 'multiline')?.querySelector('.v-note');
  return {
    tag,
    saved: row ? row.note : '',
    whiteSpace: noteEl ? getComputedStyle(noteEl).whiteSpace : '',
  };
});
check('単語帳のメモ欄は textarea', noteMultiline.tag === 'TEXTAREA', noteMultiline.tag);
check('改行入りのメモが保存される', noteMultiline.saved === '一行目\n二行目', JSON.stringify(noteMultiline.saved));
check('メモの表示で改行が保たれる', noteMultiline.whiteSpace === 'pre-wrap', noteMultiline.whiteSpace);

// インライン編集のメモも複数行
const editNote = await page.evaluate(async () => {
  const row = allVocab.find(v => v.en === 'multiline');
  startEditVocab(row.id);
  await new Promise(r => setTimeout(r, 100));
  const el = document.getElementById(`ve-note-${row.id}`);
  const out = { tag: el ? el.tagName : '', value: el ? el.value : '' };
  cancelEditVocab();
  return out;
});
check('インライン編集のメモ欄も textarea', editNote.tag === 'TEXTAREA', editNote.tag);
check('編集欄に改行がそのまま入る', editNote.value === '一行目\n二行目', JSON.stringify(editNote.value));

const ignorable = /favicon|ERR_FAILED|net::ERR|Failed to load resource/i;
const real = errors.filter(e => !ignorable.test(e));
check('コンソールエラーが無い', real.length === 0, real.join(' | '));

await browser.close();
if (fail.length) { console.error(`\n${fail.length} 件失敗`); process.exit(1); }
console.log('\nすべて通過');
