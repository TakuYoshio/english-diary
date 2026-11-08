// 採用イラスト（character/<key>/*.webp）と mascots.js の art フラグを突き合わせる。
//
// この2つは別々に直せてしまうので、片方だけ進むと静かに壊れる。
//   art:true なのに画像が無い  → 本番で全員の相棒が消える
//   画像はあるのに art:false   → 作った素材が永遠に使われない
// さらに、差し替えて使う前提なので「全枚数が同じ寸法」であることも要る。
// 寸法が揃っていないと、表情が変わるたびにキャラが飛び跳ねる。
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const src = readFileSync('mascots.js', 'utf8');

const keys = [...(src.match(/const MASCOT_ORDER = \[([^\]]+)\]/)?.[1] || '')
  .matchAll(/'([a-z]+)'/g)].map(m => m[1]);
const faces = [...(src.match(/const MASCOT_FACES_ART = \[([^\]]+)\]/s)?.[1] || '')
  .matchAll(/'([a-z]+)'/g)].map(m => m[1]);

if (!keys.length || !faces.length) {
  console.error('mascots.js から MASCOT_ORDER / MASCOT_FACES_ART を読めませんでした');
  process.exit(1);
}

const errors = [];
let withArt = 0;

// WebP/PNG のヘッダから寸法を読む（依存を増やさないため最小限の解析）
function imageSize(file) {
  const b = readFileSync(file);
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') {
    const fmt = b.slice(12, 16).toString('ascii');
    if (fmt === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xFFFFFF) + 1, h: (b.readUIntLE(27, 3) & 0xFFFFFF) + 1 };
    if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3FFF, h: b.readUInt16LE(28) & 0x3FFF };
    if (fmt === 'VP8L') {
      const n = b.readUInt32LE(21);
      return { w: (n & 0x3FFF) + 1, h: ((n >> 14) & 0x3FFF) + 1 };
    }
    return null;
  }
  if (b.slice(1, 4).toString('ascii') === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  return null;
}

for (const key of keys) {
  const dir = `character/${key}`;
  const declared = new RegExp(`${key}:\\s*\\{[^}]*art:\\s*(true|false)`).exec(src);
  const art = declared ? declared[1] === 'true' : false;
  const present = faces.filter(f => existsSync(`${dir}/${f}.webp`) || existsSync(`${dir}/${f}.png`));

  if (art && present.length !== faces.length) {
    const missing = faces.filter(f => !present.includes(f));
    errors.push(`${key}: art:true ですが素材が足りません → ${missing.join(', ')}`);
  }
  if (!art && present.length === faces.length) {
    errors.push(`${key}: 素材は揃っていますが art:false のままです（使われません）`);
  }
  if (!present.length) continue;
  withArt++;

  // 寸法が全枚数で揃っているか
  const sizes = new Map();
  for (const f of present) {
    const file = existsSync(`${dir}/${f}.webp`) ? `${dir}/${f}.webp` : `${dir}/${f}.png`;
    const sz = imageSize(file);
    if (!sz) { errors.push(`${file}: 寸法を読めません（WebP/PNG以外かもしれません）`); continue; }
    sizes.set(`${sz.w}x${sz.h}`, [...(sizes.get(`${sz.w}x${sz.h}`) || []), f]);
  }
  if (sizes.size > 1) {
    const detail = [...sizes.entries()].map(([s, fs]) => `${s}: ${fs.join(',')}`).join(' / ');
    errors.push(`${key}: 画像の寸法が揃っていません（差し替えでキャラが飛び跳ねます）→ ${detail}`);
  }

  // 想定外のファイルが混ざっていないか
  const known = new Set(faces.flatMap(f => [`${f}.webp`, `${f}.png`]));
  for (const f of readdirSync(dir)) {
    if (!known.has(f)) errors.push(`${dir}/${f}: MASCOT_FACES_ART に無い表情です`);
  }
}

if (errors.length) {
  console.error('\n' + errors.join('\n'));
  console.error(`\n${errors.length} 件: イラスト素材と mascots.js が食い違っています`);
  process.exit(1);
}
console.log(`\nイラスト素材: ${keys.length} キャラ / 表情 ${faces.length} 種を検証`
  + (withArt ? `（素材あり ${withArt} キャラ）` : '（まだ素材は未設置。SVGで描画）'));
