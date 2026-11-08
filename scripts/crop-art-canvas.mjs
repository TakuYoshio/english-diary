// 9枚まとめて同じ矩形で切り詰め、キャラが枠いっぱいに写るようにする。
//
// 納品された素材はキャラの周りに余白が多く、そのまま出すと小さく見える。
// 1枚ずつ切ると位置関係が崩れて、表情を変えるたびにキャラが動いてしまうので、
// 全枚数の不透明領域の和集合を取り、全部を同じ矩形で切る。
//
//   node scripts/crop-art-canvas.mjs <ディレクトリ> [余白%]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { decodePng, encodePng } from './png-lib.mjs';

const dir = process.argv[2];
const padPct = Number(process.argv[3] ?? 4);
if (!dir) { console.error('使い方: node scripts/crop-art-canvas.mjs <ディレクトリ> [余白%]'); process.exit(1); }

const files = readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const imgs = files.map(f => ({ f, img: decodePng(readFileSync(`${dir}/${f}`)) }));

// 全枚数の和集合
let minx = Infinity, miny = Infinity, maxx = -1, maxy = -1;
for (const { img } of imgs) {
  const { w, h, px } = img;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
  }
}
const { w: W, h: H } = imgs[0].img;
const pad = Math.round(Math.max(maxx - minx, maxy - miny) * padPct / 100);
const x0 = Math.max(0, minx - pad), y0 = Math.max(0, miny - pad);
const x1 = Math.min(W - 1, maxx + pad), y1 = Math.min(H - 1, maxy + pad);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
console.log(`和集合 x${minx}-${maxx} y${miny}-${maxy} → 切り出し ${cw}x${ch} (+${x0},+${y0}) 余白${pad}px`);

for (const { f, img } of imgs) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    img.px.copy(out, y * cw * 4, ((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + cw) * 4);
  }
  writeFileSync(`${dir}/${f}`, encodePng({ w: cw, h: ch, px: out }));
  console.log(`  ${f} → ${cw}x${ch}`);
}
