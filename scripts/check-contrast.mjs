// style.css の主要な文字色・ボタンの組み合わせがWCAG AA（4.5:1）を満たすか検査する。
// 色を触ったときに気づかずコントラストを落とさないための回帰チェック。
import { readFileSync } from 'node:fs';

const css = readFileSync('style.css', 'utf8');
const tok = name => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`トークン --${name} が見つかりません`);
  return m[1];
};

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = h => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const surface = tok('surface'), bg = tok('bg');
const cases = [
  ['本文 --text / surface',            tok('text'), surface, 4.5],
  ['補助 --text-muted / surface',      tok('text-muted'), surface, 4.5],
  ['薄字 --text-faint / surface',      tok('text-faint'), surface, 4.5],
  ['薄字 --text-faint / bg',           tok('text-faint'), bg, 4.5],
  ['主ボタン 白 / accent-on-white-text',   '#FFFFFF', tok('accent-on-white-text'), 4.5],
  ['危険ボタン 白 / danger-on-white-text', '#FFFFFF', tok('danger-on-white-text'), 4.5],
  ['警告文 --warn-text / warn-light',  tok('warn-text'), tok('warn-light'), 4.5],
  // アイコンが無い単語カードの頭文字タイル
  ['頭文字 --text / accent-light',     tok('text'), tok('accent-light'), 4.5],
  // 単語カードのピクトグラム。文字ではない図形なのでWCAGの基準は3:1
  // （1.4.11 Non-text Contrast）。
  ['アイコン --accent-on-white-text / accent-light', tok('accent-on-white-text'), tok('accent-light'), 3.0],
];

// app.js はアイコンのSVGのURLに色を直接入れる必要があり、--accent-on-white-text を
// 値で複製している。CSSのトークンを変えたときにそこだけ取り残されるのを防ぐ。
const appJs = readFileSync('app.js', 'utf8');
const iconColor = appJs.match(/const ICON_COLOR = '(#[0-9A-Fa-f]{6})'/);
if (!iconColor) {
  console.error('app.js に ICON_COLOR が見つかりません');
  process.exit(1);
}
if (iconColor[1].toUpperCase() !== tok('accent-on-white-text').toUpperCase()) {
  console.error(`\napp.js の ICON_COLOR (${iconColor[1]}) が`
    + ` --accent-on-white-text (${tok('accent-on-white-text')}) と違います`);
  process.exit(1);
}

let failed = 0;
for (const [name, fg, bgc, min] of cases) {
  const r = ratio(fg, bgc);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (>= ${min})  ${name}`);
}
if (failed) { console.error(`\n${failed} 件がWCAG AAを満たしていません`); process.exit(1); }
console.log('\nコントラスト: すべてAA適合');
