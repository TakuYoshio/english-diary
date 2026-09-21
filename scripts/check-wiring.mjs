// ビルド工程が無いぶん、HTMLとJSの結線ズレを機械的に検出する。
// 1. getElementById('x') の x が index.html に存在するか
// 2. onclick="fn(...)" の fn が JS に定義されているか
// 3. data-i18n / data-i18n-placeholder のキーが ja/en 両方に存在するか
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const jsFiles = ['app.js', 'progress.js', 'mascot.js', 'fx.js', 'kotora-svg.js', 'kotora-speech.js'];
const js = jsFiles.map(f => readFileSync(f, 'utf8')).join('\n');

const errors = [];
const warn = [];

// ── 1. DOM ids ────────────────────────────────────────────────────────────
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
// 実行時にJS側でcreateElementして付与されるid（HTMLには書かれていない）
const runtimeIds = new Set(
  [...js.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1])
);
// テンプレートリテラルで生成されるidは静的に追えないので ${...} を含むものは除外
const referenced = new Set(
  [...js.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map(m => m[1])
);
for (const id of [...referenced].sort()) {
  if (!htmlIds.has(id) && !runtimeIds.has(id)) errors.push(`DOM id が index.html にありません: #${id}`);
}

// ── 2. inline onclick handlers ───────────────────────────────────────────
const defined = new Set([
  ...[...js.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
  ...[...js.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g)].map(m => m[1]),
]);
const jsKeywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof']);
const browserGlobals = new Set(['location', 'history', 'window', 'document', 'this']);
for (const m of html.matchAll(/on(?:click|change|input|keydown|blur|error)="([^"]*)"/g)) {
  for (const call of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const fn = call[1];
    if (jsKeywords.has(fn) || browserGlobals.has(fn) || defined.has(fn)) continue;
    if (/\.\s*$/.test(m[1].slice(0, call.index))) continue; // メソッド呼び出し
    errors.push(`インラインハンドラ ${fn}() の定義が見つかりません`);
  }
}

// ── 3. i18n keys ─────────────────────────────────────────────────────────
const app = readFileSync('app.js', 'utf8');
const block = app.slice(app.indexOf('const TRANSLATIONS'), app.indexOf('\nfunction escapeHtml'));
const jaBlock = block.slice(block.indexOf('  ja: {'), block.indexOf('  en: {'));
const enBlock = block.slice(block.indexOf('  en: {'));
const keysOf = b => new Set([...b.matchAll(/'([a-z0-9][\w-]*)':/gi)].map(m => m[1]));
const ja = keysOf(jaBlock), en = keysOf(enBlock);

for (const k of [...ja].sort()) if (!en.has(k)) errors.push(`i18n: en に '${k}' がありません`);
for (const k of [...en].sort()) if (!ja.has(k)) errors.push(`i18n: ja に '${k}' がありません`);

const used = new Set([
  ...[...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map(m => m[1]),
  ...[...js.matchAll(/\bt\(\s*'([^']+)'\s*\)/g)].map(m => m[1]),
]);
for (const k of [...used].sort()) if (!ja.has(k)) errors.push(`i18n: 使われているキー '${k}' が未定義`);
for (const k of [...ja].sort()) if (!used.has(k) && !/^(cat|badge|type|score|quiz-dir|mascot-stage|home-greeting|fb|entries-(empty|no-results)|vocab-empty)/.test(k)) warn.push(`i18n: 未使用の可能性 '${k}'`);

if (warn.length) console.log(warn.map(w => 'warn: ' + w).join('\n'));
if (errors.length) { console.error('\n' + errors.join('\n')); console.error(`\n${errors.length} 件のエラー`); process.exit(1); }
console.log(`\nOK: DOM id ${referenced.size} 件 / i18n キー ${ja.size} 件 を検証`);
