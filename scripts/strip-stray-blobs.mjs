// 背景を抜いたときの消し残し（本体から切り離された塊）を透明化する。
//
// 素材の整備にだけ使う道具で、アプリ本体からは読まれない。
// 矩形で塗りつぶすと本体まで削るので、「指定した点を含む塊」だけを消す。
// 消す塊は目視で確認したものだけを座標で指定する。頭の上の効果線
// （✨ ? zZ !!）は本体から離れていても意図したものなので、消してはいけない。
//
//   node scripts/strip-stray-blobs.mjs <入力.png> <出力.png> x,y [x,y ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, blobs } from './png-lib.mjs';

const [, , src, dst, ...points] = process.argv;
if (!src || !dst || !points.length) {
  console.error('使い方: node scripts/strip-stray-blobs.mjs <入力.png> <出力.png> x,y [x,y ...]');
  process.exit(1);
}

const img = decodePng(readFileSync(src));
const found = blobs(img);
const main = found[0];

let removed = 0;
for (const p of points) {
  const [x, y] = p.split(',').map(Number);
  const blob = found.find(b => b.cells.includes(y * img.w + x));
  if (!blob) { console.error(`(${x},${y}) に塊がありません`); process.exit(1); }
  if (blob === main) { console.error(`(${x},${y}) は本体です。消せません`); process.exit(1); }
  for (const i of blob.cells) img.px[i * 4 + 3] = 0;
  removed += blob.size;
  console.log(`  消去 ${blob.size}px  x${blob.minx}-${blob.maxx} y${blob.miny}-${blob.maxy}`);
}

writeFileSync(dst, encodePng(img));
console.log(`${src} → ${dst}  計${removed}px を透明化`);
