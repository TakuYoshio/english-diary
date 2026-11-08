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

// 相棒はレベルで解放され、選んだ子がすべてのスロットに出る。
// 表情・首輪・成長段階はどのキャラでも同じ kt-* クラスで動くので、
// ここで中身を差し替えるだけで全部そのまま効く（mascots.js）。
function kotoraImg(mood = 'idle', tier = 'bronze', stage = 'kitten', key) {
  const chosen = key || (typeof currentMascotKey === 'function'
    ? currentMascotKey(mascotLevel()) : 'kotora');
  let body;
  if (typeof mascotBodyHtml === 'function') body = mascotBodyHtml(chosen, mood);
  else if (typeof mascotSvgFor === 'function') body = mascotSvgFor(chosen);
  else if (typeof kotoraSvg === 'function') body = kotoraSvg();
  else body = '<img class="kotora-img" src="character/kotora.png" alt="コトラ" />';
  return `
  <div class="kotora-wrap" data-mascot="${chosen}" data-mood="${mood}" data-tier="${tier}" data-stage="${stage}">
    ${body}
  </div>`;
}

// 相棒を変える。SVGそのものが変わるので、描画済みのものは中身を作り直す。
// 入れ物のidを頼りにすると、idの無いところに描かれた子が古いまま残る
// （マスコットモーダルの中がまさにそれだった）。.kotora-wrap を直接見る。
function chooseMascot(key) {
  if (typeof setMascotKey !== 'function' || typeof mascotSvgFor !== 'function') return;
  setMascotKey(key);
  document.querySelectorAll('.kotora-wrap').forEach(w => {
    w.dataset.mascot = key;
    w.innerHTML = (typeof mascotBodyHtml === 'function')
      ? mascotBodyHtml(key, w.dataset.mood || 'idle') : mascotSvgFor(key);
  });
  if (document.getElementById('mascot-modal').style.display !== 'none') openMascotModal();
  showToast(t('toast-mascot-changed').replace('{name}', t('mascot-name-' + key)), 'success');
}

// ── スロットの状態更新 ────────────────────────────────────────────────────
// 見た目の切り替えはすべて .kotora-wrap の data-* を見るCSS側で行っているため、
// innerHTMLで8KBのSVGを組み直す必要はない。シャドーイングは最大50回、
// 1回ごとにこれが走っていた。すでに描画済みなら属性だけ差し替える。
function mascotApply(slotId, mood, tier, stage) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const wrap = slot.querySelector('.kotora-wrap');
  // 相棒が変わっていたらSVGごと作り直す
  const want = (typeof currentMascotKey === 'function') ? currentMascotKey(mascotLevel()) : 'kotora';
  if (wrap && wrap.dataset.mascot !== want) wrap.remove();
  if (!slot.querySelector('.kotora-wrap')) {
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
  // イラストは表情が画像なので、moodが変わったら中身も描き直す
  // （SVGはCSSのdisplay切替で済むが、画像はそうはいかない）
  if (wrap.querySelector('.kt-art') && typeof mascotBodyHtml === 'function') {
    wrap.innerHTML = mascotBodyHtml(wrap.dataset.mascot, mood);
  }
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
// 相棒の選択。レベルで解放され、まだの子は何レベルで来るかを見せる
// （「続けたら何が増えるか」が見えないと、続ける理由にならない）。
function mascotPickerHtml(level) {
  if (typeof MASCOT_ORDER === 'undefined') return '';
  const current = currentMascotKey(level);
  const cards = MASCOT_ORDER.map(key => {
    const m = MASCOTS[key];
    const open = mascotUnlocked(key, level);
    const name = t('mascot-name-' + key);
    const label = open ? escapeHtml(name) : escapeHtml(t('mascot-locked').replace('{n}', m.unlock));
    return `<button class="mascot-pick" type="button"
      aria-pressed="${key === current ? 'true' : 'false'}"
      ${open ? `onclick="chooseMascot('${key}')"` : 'disabled'}
      aria-label="${escapeHtml(name)}${open ? '' : ' — ' + escapeHtml(t('mascot-locked').replace('{n}', m.unlock))}">
      <span class="mascot-pick-face" aria-hidden="true">${open ? MASCOT_FACES[key] : '🔒'}</span>
      <span class="mascot-pick-name">${open ? escapeHtml(name) : '???'}</span>
      ${open ? '' : `<span class="mascot-pick-lock">${label}</span>`}
    </button>`;
  }).join('');
  return `<div class="mascot-picker-title">${escapeHtml(t('mascot-picker-title'))}</div>
    <div class="mascot-picker">${cards}</div>`;
}

const MASCOT_FACES = { neko: '🐱', akita: '🐶', kuma: '🐻' };

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
    ${mascotPickerHtml(stats.level)}
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
