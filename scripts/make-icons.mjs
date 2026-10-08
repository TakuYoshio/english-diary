// PWAアイコンを既存のコトラSVG（kotora-svg.js）からブラウザで実レンダリングして書き出す。
// 手描きのPNGを置くと配色を二重管理することになるため、必ずstyle.cssのトークンから起こす。
// 使い方: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const css = readFileSync('style.css', 'utf8');
const svgJs = readFileSync('kotora-svg.js', 'utf8');

// アイコンは顔だけを大きく見せたいので、viewBoxを頭部に寄せて切り出す
const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${css}
html,body{margin:0;padding:0;background:transparent}
#stage{width:512px;height:512px;display:grid;place-items:center;
  background:linear-gradient(145deg,#FF8A5B 0%,#FF7847 55%,#F05E2E 100%);}
#stage.maskable{padding:0}
.kotora-wrap{width:100%;height:100%;display:grid;place-items:center;box-shadow:none!important}
/* moodの装飾絵文字（💕✨など）とアニメーションはアイコンには不要 */
.kotora-wrap::after{content:none!important;display:none!important}
.kotora-img{width:var(--sz,88%);height:var(--sz,88%);overflow:visible;
  animation:none!important;transform:none!important;filter:none!important}
</style></head><body>
<div id="stage"><div class="kotora-wrap" data-mood="happy" data-tier="gold" data-stage="adult"></div></div>
<script>${svgJs}
document.querySelector('.kotora-wrap').innerHTML = kotoraSvg();
// 顔が中心に大きく来るようにviewBoxを頭部へ寄せる
const svg = document.querySelector('svg.kotora-img');
svg.setAttribute('viewBox', '42 40 236 236');
<\/script></body></html>`;

const preinstalled = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(preinstalled ? { executablePath: preinstalled } : {});

async function shoot(file, size, { maskable = false } = {}) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(page, { waitUntil: 'load' });
  await p.evaluate(({ size, maskable }) => {
    const s = document.getElementById('stage');
    s.style.width = s.style.height = size + 'px';
    // maskableは端末側で最大20%が切り落とされるため、安全域を確保して小さく描く
    document.querySelector('.kotora-img').style.setProperty('--sz', maskable ? '62%' : '88%');
  }, { size, maskable });
  await p.waitForTimeout(150);
  const buf = await p.locator('#stage').screenshot({ type: 'png' });
  writeFileSync(file, buf);
  await p.close();
  console.log(`${file} (${size}x${size}${maskable ? ', maskable' : ''})`);
}

await shoot('icons/icon-192.png', 192);
await shoot('icons/icon-512.png', 512);
await shoot('icons/icon-maskable-512.png', 512, { maskable: true });
await shoot('icons/apple-touch-icon.png', 180);
await shoot('icons/favicon-32.png', 32);
await browser.close();
