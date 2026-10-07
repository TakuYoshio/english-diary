// worker/wrangler.toml が wrangler に読める形かを検査する。
//
// 以前 `id = ""` を「未設定」のプレースホルダとして置いていたところ、
// wrangler 4 がそれを不正な設定として扱い、設定の解析段階で止まった。
// deploy どころか login も kv namespace create も実行できず、
// 直そうにもwranglerが動かないという手詰まりになった。
// 空文字のプレースホルダは書かず、未設定はコメントアウトで表す。
//
// 依存ゼロの方針があるのでTOMLパーサは入れない。この種の壊れ方は
// 「必須の値が空」という単純な形なので、行単位の解析で足りる。
import { readFileSync } from 'node:fs';

const PATH = 'worker/wrangler.toml';
const text = readFileSync(PATH, 'utf8');

// コメント行を落としてから見る（コメントアウトされた設定は無効なので対象外）
const lines = text.split('\n').map((raw, i) => ({ no: i + 1, raw }));
const active = lines.filter(l => !/^\s*#/.test(l.raw));

const errors = [];

// ── 1. トップレベルの必須キー ────────────────────────────────────────────
for (const key of ['name', 'main', 'compatibility_date']) {
  const hit = active.find(l => new RegExp(`^\\s*${key}\\s*=`).test(l.raw));
  if (!hit) { errors.push(`${key} が設定されていません`); continue; }
  const value = hit.raw.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  if (!value) errors.push(`${PATH}:${hit.no} ${key} が空です`);
}

// ── 2. 有効な設定に空文字の値が無いこと ──────────────────────────────────
// wrangler が弾くのはこの形。KVのidに限らず、空の値は書かない。
for (const l of active) {
  const m = l.raw.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(""|'')\s*$/);
  if (m) {
    errors.push(
      `${PATH}:${l.no} ${m[1]} が空文字です。`
      + 'wrangler 4 は空の値を不正な設定として扱い、login や deploy ごと失敗します。'
      + '未設定を表したいなら、その行（必要ならブロックごと）をコメントアウトしてください'
    );
  }
}

// ── 3. kv_namespaces が有効なら id が入っていること ──────────────────────
const kvIdx = active.findIndex(l => /^\s*\[\[kv_namespaces\]\]/.test(l.raw));
if (kvIdx >= 0) {
  // ブロック内（次のテーブル見出しまで）に binding と id が揃っているか
  const rest = active.slice(kvIdx + 1);
  const end = rest.findIndex(l => /^\s*\[/.test(l.raw));
  const block = end === -1 ? rest : rest.slice(0, end);
  for (const key of ['binding', 'id']) {
    const hit = block.find(l => new RegExp(`^\\s*${key}\\s*=`).test(l.raw));
    if (!hit) errors.push(`${PATH} の [[kv_namespaces]] に ${key} がありません`);
  }
} else {
  // コメントアウトされている状態は正しいプレースホルダなので、
  // エラーではなく「まだ有効になっていない」ことだけ伝える。
  console.log(
    'warn: [[kv_namespaces]] がコメントアウトされています。'
    + 'レート制限（AIの1日80回）と写真のキャッシュは無効です。\n'
    + '      有効にする: npx wrangler kv namespace create RATE_LIMIT で id を作り、'
    + 'worker/wrangler.toml のブロックのコメントを外す'
  );
}

if (errors.length) {
  console.error('\n' + errors.join('\n'));
  console.error(`\n${errors.length} 件: wrangler が読めない設定です`);
  process.exit(1);
}
console.log(`\nwrangler設定: ${PATH} を検証（有効な行 ${active.filter(l => l.raw.trim()).length} 行）`);
