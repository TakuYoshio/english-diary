'use strict';

// ── コトラ（マスコット）─────────────────────────────────────────────────────
// シャドーイング＝忍び寄って仕留める猫の狩り遊びから着想したマスコット。
// SVGはインラインテンプレートで生成し、成長段階(stage)とポーズ(pose)は
// data属性経由でCSS側から見た目を切り替える（app.jsやprogress.jsとは疎結合）。

function mascotGrowthStage(level) {
  return level >= 8 ? 'adult' : level >= 4 ? 'young' : 'kitten';
}

function mascotCollarTier(level) {
  return level >= 10 ? 'diamond' : level >= 7 ? 'gold' : level >= 4 ? 'silver' : 'bronze';
}

function kotoraSVG(stage = 'kitten', pose = 'idle', tier = 'bronze') {
  return `
  <svg class="kotora" data-stage="${stage}" data-pose="${pose}" data-tier="${tier}"
       viewBox="0 0 140 140" role="img" aria-label="コトラ">
    <g class="kotora-tail-group">
      <path class="kotora-tail" d="M40,92 C18,92 10,70 22,54" fill="none"
            stroke="var(--mascot-fur)" stroke-width="12" stroke-linecap="round" />
    </g>
    <g class="kotora-body-group">
      <ellipse class="kotora-body" cx="70" cy="92" rx="34" ry="27" fill="var(--mascot-fur)" />
      <ellipse cx="70" cy="99" rx="17" ry="15" fill="var(--mascot-fur-light)" />
      <path d="M56,80 q6,-6 12,0" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="3" stroke-linecap="round" />
      <path d="M72,80 q6,-6 12,0" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="3" stroke-linecap="round" />
      <rect class="kotora-collar" x="55" y="63" width="30" height="7" rx="3.5" fill="var(--mascot-collar)" />
      <circle class="kotora-bell" cx="70" cy="72" r="3.5" fill="var(--mascot-collar)" />
    </g>
    <g class="kotora-head-group">
      <path class="kotora-ear kotora-ear-l" d="M46,38 L40,18 L60,32 Z" fill="var(--mascot-fur)" />
      <path class="kotora-ear kotora-ear-l-inner" d="M47,34 L44,23 L56,31 Z" fill="var(--mascot-ear-inner)" />
      <path class="kotora-ear kotora-ear-r" d="M94,38 L100,18 L80,32 Z" fill="var(--mascot-fur)" />
      <path class="kotora-ear kotora-ear-r-inner" d="M93,34 L96,23 L84,31 Z" fill="var(--mascot-ear-inner)" />
      <circle class="kotora-head" cx="70" cy="54" r="27" fill="var(--mascot-fur)" />
      <path d="M50,44 q4,-5 9,-2" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="2.5" stroke-linecap="round" />
      <path d="M81,42 q5,-3 9,2" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="2.5" stroke-linecap="round" />

      <g class="kotora-eyes kotora-eyes-open">
        <ellipse cx="60" cy="55" rx="5" ry="6.5" fill="var(--mascot-eye)" />
        <ellipse cx="80" cy="55" rx="5" ry="6.5" fill="var(--mascot-eye)" />
        <circle cx="61.5" cy="52" r="1.6" fill="#fff" />
        <circle cx="81.5" cy="52" r="1.6" fill="#fff" />
      </g>
      <g class="kotora-eyes kotora-eyes-happy">
        <path d="M55,56 q5,-6 10,0" fill="none" stroke="var(--mascot-eye)" stroke-width="2.6" stroke-linecap="round" />
        <path d="M75,56 q5,-6 10,0" fill="none" stroke="var(--mascot-eye)" stroke-width="2.6" stroke-linecap="round" />
      </g>
      <g class="kotora-eyes kotora-eyes-wide">
        <circle cx="60" cy="55" r="7" fill="var(--mascot-eye)" />
        <circle cx="80" cy="55" r="7" fill="var(--mascot-eye)" />
        <circle cx="62" cy="52" r="2.2" fill="#fff" />
        <circle cx="82" cy="52" r="2.2" fill="#fff" />
      </g>

      <path class="kotora-nose" d="M67,63 L73,63 L70,67 Z" fill="var(--mascot-nose)" />
      <path class="kotora-mouth" d="M70,67 q-5,5 -10,2 M70,67 q5,5 10,2" fill="none"
            stroke="var(--mascot-fur-dark)" stroke-width="1.6" stroke-linecap="round" />

      <g class="kotora-whiskers">
        <line x1="42" y1="58" x2="24" y2="54" />
        <line x1="42" y1="63" x2="23" y2="63" />
        <line x1="98" y1="58" x2="116" y2="54" />
        <line x1="98" y1="63" x2="117" y2="63" />
      </g>
    </g>
  </svg>`;
}

// ── フック: シャドーイング（忍び足→キャッチ）────────────────────────────────
let _mascotShadowSettleTimer = null;

function mascotUpdateShadowPose(pct, reachedGoal) {
  const slot = document.getElementById('step6-mascot');
  if (!slot) return;
  const level = (typeof computeProgressStats === 'function') ? computeProgressStats().level : 1;
  const stage = mascotGrowthStage(level);
  const tier = mascotCollarTier(level);

  clearTimeout(_mascotShadowSettleTimer);
  let pose = 'idle';
  if (reachedGoal) pose = 'catch';
  else if (pct > 0) pose = 'pounce';

  slot.innerHTML = kotoraSVG(stage, pose, tier);

  if (pose === 'catch') {
    _mascotShadowSettleTimer = setTimeout(() => {
      slot.innerHTML = kotoraSVG(stage, 'loaf', tier);
    }, 700);
  }
}

// ── フック: 日記保存完了 / ストリーク更新 ───────────────────────────────────
function mascotCelebrateSave(streakGrew) {
  let popup = document.getElementById('mascot-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'mascot-popup';
    popup.className = 'mascot-popup';
    document.body.appendChild(popup);
  }
  const level = (typeof computeProgressStats === 'function') ? computeProgressStats().level : 1;
  const stage = mascotGrowthStage(level);
  const tier = mascotCollarTier(level);
  const pose = streakGrew ? 'stretch' : 'loaf';

  popup.innerHTML = kotoraSVG(stage, pose, tier);
  popup.classList.remove('mascot-popup-in');
  // reflow してから再度アニメーションを付与（連続保存時にも毎回再生させる）
  void popup.offsetWidth;
  popup.classList.add('mascot-popup-in');

  clearTimeout(popup._t);
  popup._t = setTimeout(() => { popup.classList.remove('mascot-popup-in'); }, 2600);
}

// ── progress.js の再計算後に呼ばれる（Step6の待機ポーズなどを最新化） ────────
function mascotOnProgressRefresh() {
  const slot = document.getElementById('step6-mascot');
  if (!slot || slot.innerHTML) return; // 既に表示中なら上書きしない
  const level = computeProgressStats().level;
  slot.innerHTML = kotoraSVG(mascotGrowthStage(level), 'idle', mascotCollarTier(level));
}

// ── マスコットモーダル（成長段階＋XPバー＋バッジ一覧） ───────────────────────
function openMascotModal() {
  const stats = computeProgressStats();
  const stage = mascotGrowthStage(stats.level);
  const tier = mascotCollarTier(stats.level);
  const stageLabel = t('mascot-stage-' + stage);
  const pct = Math.round(stats.xpIntoLevel / stats.xpForNextLevel * 100);

  document.getElementById('mascot-modal-title').textContent =
    t('mascot-modal-title') + ' ・ ' + t('mascot-level-label').replace('{level}', stats.level);

  document.getElementById('mascot-modal-body').innerHTML = `
    <div class="mascot-modal-display">${kotoraSVG(stage, 'idle', tier)}</div>
    <div class="mascot-stage-label">${escapeHtml(stageLabel)}</div>
    <div class="mascot-xp-track"><div class="mascot-xp-fill" style="width:${pct}%"></div></div>
    <div class="mascot-xp-caption">${escapeHtml(t('mascot-next-level').replace('{xp}', stats.xpForNextLevel - stats.xpIntoLevel))}</div>
    <div class="mascot-badges-title">${escapeHtml(t('mascot-badges-title'))}</div>
    <div class="mascot-badges-grid">
      ${stats.badges.map(b => `
        <div class="mascot-badge${b.done ? ' mascot-badge-done' : ''}" title="${escapeHtml(t('badge-' + b.id))}">
          <span class="mascot-badge-icon">${b.icon}</span>
          <span class="mascot-badge-label">${escapeHtml(t('badge-' + b.id))}</span>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('mascot-modal').style.display = 'flex';
}
