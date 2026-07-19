'use strict';

// ── FX（マイクロインタラクション: コンフェッティ・数値カウントアップ）────────
// app.jsより先に読み込まれる。ライブラリ非依存・prefers-reduced-motionを尊重する。

function fxReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 日記保存などの祝福時に紙吹雪を散らす（1.8秒で自動消滅）
function burstConfetti() {
  if (fxReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-confetti';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#FF7847', '#1CAF9E', '#F6B93B', '#FDA4AF', '#FFD9C7'];
  const parts = Array.from({ length: 60 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.5,
    y: canvas.height * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: -(4 + Math.random() * 8),
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const DURATION = 1800;
  requestAnimationFrame(function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
    parts.forEach(p => {
      p.vy += 0.25; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  });
}

// 数値をなめらかにカウントアップ（formatで文字列テンプレートに埋め込める）
function animateNumber(el, from, to, ms = 500, format = String) {
  if (!el) return;
  if (fxReducedMotion() || from === to) { el.textContent = format(to); return; }
  const start = performance.now();
  requestAnimationFrame(function frame(now) {
    const p = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(frame);
  });
}
