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
  // kotora-svg.js が読み込まれていればパーツアニメーション可能なSVG、なければ旧PNG
  const body = (typeof kotoraSvg === 'function')
    ? kotoraSvg()
    : '<img class="kotora-img" src="character/kotora.png" alt="コトラ" />';
  return `
  <div class="kotora-wrap" data-mood="${mood}" data-tier="${tier}" data-stage="${stage}">
    ${body}
  </div>`;
}

// ── スロットの状態更新 ────────────────────────────────────────────────────
// 見た目の切り替えはすべて .kotora-wrap の data-* を見るCSS側で行っているため、
// innerHTMLで8KBのSVGを組み直す必要はない。シャドーイングは最大50回、
// 1回ごとにこれが走っていた。すでに描画済みなら属性だけ差し替える。
function mascotApply(slotId, mood, tier, stage) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const wrap = slot.querySelector('.kotora-wrap');
  if (!wrap) {
    const level = mascotLevel();
    slot.innerHTML = kotoraImg(mood, tier || mascotCollarTier(level), stage || mascotGrowthStage(level));
    return;
  }
  // 同じmoodを再指定したときも演出をやり直せるよう、一度外してリフローを挟む
  if (wrap.dataset.mood === mood) {
    wrap.removeAttribute('data-mood');
    void wrap.offsetWidth;
  }
  wrap.dataset.mood = mood;
  if (tier)  wrap.dataset.tier  = tier;
  if (stage) wrap.dataset.stage = stage;
}

function mascotLevel() {
  return (typeof computeProgressStats === 'function') ? computeProgressStats().level : 1;
}

// ── フック: シャドーイング（忍び足→キャッチ）────────────────────────────────
let _mascotShadowSettleTimer = null;

function mascotUpdateShadowPose(pct, reachedGoal) {
  const slot = document.getElementById('step6-mascot');
  if (!slot) return;

  clearTimeout(_mascotShadowSettleTimer);
  let mood = 'idle';
  if (reachedGoal) mood = 'delighted';
  else if (pct > 0) mood = 'excited';

  mascotApply('step6-mascot', mood);

  if (mood === 'delighted') {
    if (typeof kotoraSay === 'function') kotoraSay('step6-mascot', 'shadow-goal', { once: true });
    _mascotShadowSettleTimer = setTimeout(() => mascotApply('step6-mascot', 'happy'), 700);
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

  if (typeof kotoraSay === 'function') {
    const lineKey = leveledUp ? 'save-levelup' : badgeEarned ? 'save-badge' : streakGrew ? 'save-streak' : 'save-done';
    kotoraSay('mascot-popup', lineKey, { duration: 2400 });
  }

  if (streakGrew) {
    ['streak-badge', 'home-streak'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('streak-pulse');
      void el.offsetWidth;
      el.classList.add('streak-pulse');
    });
  }
}

// ── progress.js の再計算後に呼ばれる（Step6の待機ポーズなどを最新化） ────────
function mascotOnProgressRefresh() {
  const slot = document.getElementById('step6-mascot');
  if (slot && !slot.innerHTML) mascotApply('step6-mascot', 'idle');
  // 初回ロード時など、現在表示中の日記ステップのマスコットが未描画なら埋める
  if (typeof currentDiaryStep !== 'undefined' && typeof mascotShowDiaryStep === 'function') {
    const dslot = document.getElementById('step' + currentDiaryStep + '-mascot');
    if (dslot && !dslot.innerHTML) mascotShowDiaryStep(currentDiaryStep);
  }
}

// ── フック: クイズの正誤（喜怒哀楽の実演出）──────────────────────────────────
let _mascotQuizSettleTimer = null;

function mascotResetQuizMood() {
  clearTimeout(_mascotQuizSettleTimer);
  mascotApply('quiz-mascot', 'idle');
}

function mascotReactQuiz(isOk) {
  if (!document.getElementById('quiz-mascot')) return;
  clearTimeout(_mascotQuizSettleTimer);
  mascotApply('quiz-mascot', isOk ? 'delighted' : 'sad');
  if (typeof kotoraSay === 'function') {
    kotoraSay('quiz-mascot', isOk ? 'quiz-ok' : 'quiz-ng', { typewriter: false, duration: 1600 });
  }
  _mascotQuizSettleTimer = setTimeout(() => mascotApply('quiz-mascot', 'idle'), 1200);
}

// ── 汎用: 指定スロットのmoodを直接設定 ────────────────────────────────────
function mascotSetMood(slotId, mood) {
  mascotApply(slotId, mood);
}

// ── フック: 日記ウィザードの各ステップ表示時（待機中はidle） ─────────────────
function mascotShowDiaryStep(n) {
  if (n === 5 || n === 6) return; // Step5/6は専用の反応ロジックを持つ
  mascotSetMood('step' + n + '-mascot', 'idle');
  if (typeof kotoraSay === 'function') kotoraSay('step' + n + '-mascot', 'step' + n + '-guide', { once: true });
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
  openModal('mascot-modal');
}
