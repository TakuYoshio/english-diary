// 3キャラの「体の大きさ / 画布の高さ」を揃える（素材整備用。アプリからは読まれない）。
//
// crop-art-canvas.mjs で切り詰めただけだと、効果マーク（? zZ ✨ !!）の
// 広がりがキャラごとに違うぶん画布の比率がズレ、見かけの大きさが変わる。
// 実際に犬と熊が猫より1割ほど大きく見えた。
//
// アプリは object-fit:contain + object-position:center bottom で描くので、
// 足元を動かさないよう**上にだけ**透明を足し、いちばん背の高い画布に合わせる。
//
//   node scripts/equalize-art-scale.mjs <ディレクトリ> [<ディレクトリ> ...]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { decodePng, encodePng, blobs } from './png-lib.mjs';

const dirs = process.argv.slice(2);
const info = dirs.map(d => {
  const img = decodePng(readFileSync(`${d}/normal.png`));
  const b = blobs(img)[0];
  return { d, h: img.h, w: img.w, bodyH: b.maxy - b.miny + 1, bottom: img.h - b.maxy };
});
const target = Math.max(...info.map(i => i.h));
console.log(`目標の画布高: ${target}px`);
for (const i of info) {
  const add = target - i.h;
  console.log(`${i.d.split('/').pop()}: ${i.w}x${i.h} 体${i.bodyH}px 下余白${i.bottom}px → 上に${add}px追加`);
  if (!add) continue;
  for (const f of readdirSync(i.d).filter(f => f.endsWith('.png'))) {
    const img = decodePng(readFileSync(`${i.d}/${f}`));
    const px = Buffer.alloc(img.w * target * 4);          // 透明で初期化
    img.px.copy(px, add * img.w * 4);                      // 下寄せで貼る
    writeFileSync(`${i.d}/${f}`, encodePng({ w: img.w, h: target, px }));
  }
}
