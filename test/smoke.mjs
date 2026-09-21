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

const ignorable = /favicon|ERR_FAILED|net::ERR|Failed to load resource/i;
const real = errors.filter(e => !ignorable.test(e));
check('コンソールエラーが無い', real.length === 0, real.join(' | '));

await browser.close();
if (fail.length) { console.error(`\n${fail.length} 件失敗`); process.exit(1); }
console.log('\nすべて通過');
