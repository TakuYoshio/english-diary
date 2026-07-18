'use strict';

// ── コトラ（マスコット）─────────────────────────────────────────────────────
// 1枚のイラスト（character/kotora.png）を土台に、感情/ゲーミフィケーション状態(mood)・
// 首輪ティア(tier)・成長段階(stage)をdata属性経由でCSS側から見た目を切り替える
// （app.jsやprogress.jsとは疎結合）。moodはCSSのfilter/animation/::afterの絵文字で表現する。

function mascotGrowthStage(level) {
  return level >= 8 ? 'adult' : level >= 4 ? 'young' : 'kitten';
}

function mascotCollarTier(level) {
  return level >= 10 ? 'diamond' : level >= 7 ? 'gold' : level >= 4 ? 'silver' : 'bronze';
}

function kotoraImg(mood = 'idle', tier = 'bronze', stage = 'kitten') {
  return `
  <div class="kotora-wrap" data-mood="${mood}" data-tier="${tier}" data-stage="${stage}">
    <img class="kotora-img" src="character/kotora.png" alt="コトラ" />
  </div>`;
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
  let mood = 'idle';
  if (reachedGoal) mood = 'delighted';
  else if (pct > 0) mood = 'excited';

  slot.innerHTML = kotoraImg(mood, tier, stage);

  if (mood === 'delighted') {
    _mascotShadowSettleTimer = setTimeout(() => {
      slot.innerHTML = kotoraImg('happy', tier, stage);
    }, 700);
  }
}

// ── フック: 日記保存完了 / ストリーク更新・レベルアップ・バッジ獲得 ──────────
function mascotCelebrateSave({ streakGrew = false, leveledUp = false, badgeEarned = false } = {}) {
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
  const mood = leveledUp ? 'levelup' : badgeEarned ? 'badge' : streakGrew ? 'happy' : 'idle';

  popup.innerHTML = kotoraImg(mood, tier, stage);
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
  if (slot && !slot.innerHTML) {
    const level = computeProgressStats().level;
    slot.innerHTML = kotoraImg('idle', mascotCollarTier(level), mascotGrowthStage(level));
  }
  // 初回ロード時など、現在表示中の日記ステップのマスコットが未描画なら埋める
  if (typeof currentDiaryStep !== 'undefined' && typeof mascotShowDiaryStep === 'function') {
    const dslot = document.getElementById('step' + currentDiaryStep + '-mascot');
    if (dslot && !dslot.innerHTML) mascotShowDiaryStep(currentDiaryStep);
  }
}

// ── フック: クイズの正誤（喜怒哀楽の実演出）──────────────────────────────────
let _mascotQuizSettleTimer = null;

function mascotResetQuizMood() {
  const slot = document.getElementById('quiz-mascot');
  if (!slot) return;
  clearTimeout(_mascotQuizSettleTimer);
  const level = (typeof computeProgressStats === 'function') ? computeProgressStats().level : 1;
  slot.innerHTML = kotoraImg('idle', mascotCollarTier(level), mascotGrowthStage(level));
}

function mascotReactQuiz(isOk) {
  const slot = document.getElementById('quiz-mascot');
  if (!slot) return;
  const level = (typeof computeProgressStats === 'function') ? computeProgressStats().level : 1;
  const stage = mascotGrowthStage(level);
  const tier = mascotCollarTier(level);

  clearTimeout(_mascotQuizSettleTimer);
  slot.innerHTML = kotoraImg(isOk ? 'delighted' : 'sad', tier, stage);
  _mascotQuizSettleTimer = setTimeout(() => {
    slot.innerHTML = kotoraImg('idle', tier, stage);
  }, 1200);
}

// ── 汎用: 指定スロットのmoodを直接設定 ────────────────────────────────────
function mascotSetMood(slotId, mood) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const level = (typeof computeProgressStats === 'function') ? computeProgressStats().level : 1;
  slot.innerHTML = kotoraImg(mood, mascotCollarTier(level), mascotGrowthStage(level));
}

// ── フック: 日記ウィザードの各ステップ表示時（待機中はidle） ─────────────────
function mascotShowDiaryStep(n) {
  if (n === 5 || n === 6) return; // Step5/6は専用の反応ロジックを持つ
  mascotSetMood('step' + n + '-mascot', 'idle');
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
    <div class="mascot-modal-display">${kotoraImg('idle', tier, stage)}</div>
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
