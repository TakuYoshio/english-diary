'use strict';

// ── Progress data (streak / calendar / stats / XP) ─────────────────────────
// entries全件の軽量データ（本文テキストは含めない）。ストリーク・カレンダー・
// 統計・XP計算はすべてこの配列から算出する。
let entriesMeta = []; // [{id, date, pronunciation_first_attempt, feedback}]

async function loadEntriesMeta() {
  const { data } = await sb.from('entries')
    .select('id,date,pronunciation_first_attempt,feedback')
    .order('date', { ascending: false });
  entriesMeta = data || [];
  return entriesMeta;
}

// ── Streak ───────────────────────────────────────────────────────────────
function computeStreaks(meta) {
  const dateSet = new Set(meta.map(e => e.date));
  const dates = [...dateSet].sort(); // ascending 'YYYY-MM-DD'
  if (!dates.length) return { current: 0, longest: 0 };

  // 'YYYY-MM-DD'はタイムゾーンを持たない暦日なので、常にUTC正午として扱うことで
  // ローカル時刻パース→toISOString(UTC)の往復によるズレ（日付が1日飛ぶ等）を避ける。
  const oneDay = 24 * 60 * 60 * 1000;
  const toUTC = dateStr => new Date(dateStr + 'T12:00:00Z').getTime();
  const toDateStr = ms => new Date(ms).toISOString().split('T')[0];

  let longest = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round((toUTC(dates[i]) - toUTC(dates[i - 1])) / oneDay);
    run = diffDays === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // 現在の連続日数: 今日 or 昨日を起点に、日付が1日ずつ遡って連続している数
  const today = todayISO();
  const yesterday = toDateStr(toUTC(today) - oneDay);
  let current = 0;
  if (dateSet.has(today) || dateSet.has(yesterday)) {
    let cursor = dateSet.has(today) ? today : yesterday;
    while (dateSet.has(cursor)) {
      current++;
      cursor = toDateStr(toUTC(cursor) - oneDay);
    }
  }
  return { current, longest };
}

// ── XP / Level / Badges（新規テーブルなし。既存entries/vocabから計算） ──────
function computeXp({ entriesMeta, vocabSummary, longestStreak }) {
  const pronGood = entriesMeta.filter(e => (e.pronunciation_first_attempt?.score ?? 0) >= 80).length;
  return entriesMeta.length * 15
    + vocabSummary.count * 3
    + vocabSummary.correctTotal * 2
    + pronGood * 5
    + Math.floor(longestStreak / 7) * 20;
}

function xpToLevel(xpTotal) {
  let level = 1, need = 100, xp = xpTotal;
  while (xp >= need) { xp -= need; level++; need = Math.round(need * 1.35); }
  return { level, xpIntoLevel: xp, xpForNextLevel: need };
}

const BADGE_DEFS = [
  { id: 'first-entry',      icon: '📔', test: s => s.entriesMeta.length >= 1 },
  { id: 'streak-3',         icon: '🔥', test: s => s.longestStreak >= 3 },
  { id: 'streak-7',         icon: '🔥', test: s => s.longestStreak >= 7 },
  { id: 'streak-30',        icon: '🔥', test: s => s.longestStreak >= 30 },
  { id: 'vocab-50',         icon: '🧶', test: s => s.vocabSummary.count >= 50 },
  { id: 'vocab-100',        icon: '🧶', test: s => s.vocabSummary.count >= 100 },
  { id: 'pronunciation-90', icon: '🎤', test: s => s.entriesMeta.some(e => (e.pronunciation_first_attempt?.score ?? 0) >= 90) },
];

function computeBadges(stats) {
  return BADGE_DEFS.map(def => ({ id: def.id, icon: def.icon, done: def.test(stats) }));
}

function computeProgressStats() {
  const vocabSummary = computeVocabSummary();
  const { longest } = computeStreaks(entriesMeta);
  const stats = { entriesMeta, vocabSummary, longestStreak: longest };
  const xp = computeXp(stats);
  const { level, xpIntoLevel, xpForNextLevel } = xpToLevel(xp);
  const badges = computeBadges(stats);
  return { xp, level, xpIntoLevel, xpForNextLevel, badges, longestStreak: longest, vocabSummary };
}

// ── Vocab summary (allVocabはapp.jsのrenderVocab()がグローバルに保持) ───────
function computeVocabSummary() {
  const list = (typeof allVocab !== 'undefined' && allVocab) ? allVocab : [];
  const correctTotal = list.reduce((sum, v) => sum + (v.correct || 0), 0);
  const wrongTotal   = list.reduce((sum, v) => sum + (v.wrong || 0), 0);
  return { count: list.length, correctTotal, wrongTotal };
}

// ── Header streak badge ─────────────────────────────────────────────────
function renderStreakBadge(id = 'streak-badge') {
  const badge = document.getElementById(id);
  if (!badge) return;
  const { current, longest } = computeStreaks(entriesMeta);
  if (current === 0) {
    badge.innerHTML = `<span class="streak-flame streak-flame-off">🔥</span><span class="streak-count">0</span>`;
    badge.title = t('streak-title-zero');
  } else {
    badge.innerHTML = `<span class="streak-flame">🔥</span><span class="streak-count">${current}</span>`;
    badge.title = t('streak-title').replace('{current}', current).replace('{longest}', longest);
  }
}

// ── Entry point: 進捗まわりの再計算＋描画をまとめて行う ─────────────────────
function refreshProgressUI() {
  renderStreakBadge();
  const calEl = document.getElementById('entries-calendar');
  const statsEl = document.getElementById('entries-stats');
  if (calEl && calEl.style.display !== 'none') renderEntriesCalendar();
  if (statsEl && statsEl.style.display !== 'none') renderStatsDashboard();
  if (typeof mascotOnProgressRefresh === 'function') mascotOnProgressRefresh();
}

// ── Entries view toggle (一覧 / カレンダー / 統計) ─────────────────────────
function switchEntriesView(view) {
  document.querySelectorAll('.entries-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('entries-list-view').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('entries-calendar').style.display  = view === 'calendar' ? 'block' : 'none';
  document.getElementById('entries-stats').style.display     = view === 'stats' ? 'block' : 'none';
  if (view === 'calendar') renderEntriesCalendar();
  if (view === 'stats') renderStatsDashboard();
}

// ── Calendar ─────────────────────────────────────────────────────────────
let calendarMonthOffset = 0;

function changeCalendarMonth(delta) {
  calendarMonthOffset += delta;
  renderEntriesCalendar();
}

function renderEntriesCalendar() {
  const container = document.getElementById('entries-calendar');
  if (!container) return;

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calendarMonthOffset);
  const year = base.getFullYear(), month = base.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const dateToId = {};
  entriesMeta.forEach(e => { dateToId[e.date] = e.id; });

  const monthLabel = getLang() === 'ja' ? `${year}年 ${month + 1}月` :
    new Date(year, month, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const weekdayLabels = getLang() === 'ja' ? ['日','月','火','水','木','金','土'] : ['S','M','T','W','T','F','S'];

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasEntry = Object.prototype.hasOwnProperty.call(dateToId, iso);
    const isToday = iso === todayISO();
    cells += `<div class="cal-cell${hasEntry ? ' cal-has-entry' : ''}${isToday ? ' cal-today' : ''}"
      ${hasEntry ? `onclick="openEntryDetail(${dateToId[iso]})"` : ''}>
      <span class="cal-daynum">${d}</span>${hasEntry ? '<span class="cal-dot"></span>' : ''}
    </div>`;
  }

  container.innerHTML = `
    <div class="cal-header">
      <button class="btn btn-sm" onclick="changeCalendarMonth(-1)">←</button>
      <div class="cal-month-label">${escapeHtml(monthLabel)}</div>
      <button class="btn btn-sm" onclick="changeCalendarMonth(1)">→</button>
    </div>
    <div class="cal-weekdays">${weekdayLabels.map(w => `<div class="cal-weekday">${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  `;
}

// ── Stats dashboard ───────────────────────────────────────────────────────
function svgSparkline(values, { width = 280, height = 56, color = 'var(--accent)' } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = (max - min) || 1;
  const pad = 4;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const toY = v => pad + (height - pad * 2) * (1 - (v - min) / range);
  const points = values.map((v, i) => `${pad + i * stepX},${toY(v)}`).join(' ');
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = toY(values[values.length - 1]);
  return `
    <svg viewBox="0 0 ${width} ${height}" class="stat-sparkline" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="${color}" />
    </svg>`;
}

function weeklyBuckets(dateStrings, weeks = 8) {
  const oneDay = 24 * 60 * 60 * 1000;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const buckets = new Array(weeks).fill(0);
  dateStrings.forEach(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.floor((now - d) / oneDay);
    const weekIndex = Math.floor(diffDays / 7);
    const idx = weeks - 1 - weekIndex;
    if (idx >= 0 && idx < weeks) buckets[idx]++;
  });
  return buckets;
}

function vocabCumulativeTrend(vocabList, weeks = 8) {
  const oneDay = 24 * 60 * 60 * 1000;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const buckets = new Array(weeks).fill(0);
  let before = 0;
  vocabList.forEach(v => {
    const d = new Date(v.created_at);
    const diffDays = Math.floor((now - d) / oneDay);
    const weekIndex = Math.floor(diffDays / 7);
    const idx = weeks - 1 - weekIndex;
    if (idx >= 0 && idx < weeks) buckets[idx]++;
    else if (weekIndex >= weeks) before++;
  });
  let running = before;
  return buckets.map(c => running += c);
}

function pronunciationTrend(meta, limit = 12) {
  return meta
    .filter(e => e.pronunciation_first_attempt && e.pronunciation_first_attempt.score != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map(e => e.pronunciation_first_attempt.score);
}

function categoryFeedbackCounts(meta) {
  const counts = { grammar: 0, vocabulary: 0, expression: 0, other: 0 };
  meta.forEach(e => {
    (e.feedback?.categories || []).forEach(cat => {
      if (Object.prototype.hasOwnProperty.call(counts, cat.category)) {
        counts[cat.category] += (cat.corrections || []).length;
      }
    });
  });
  return counts;
}

function renderStatsDashboard() {
  const container = document.getElementById('entries-stats');
  if (!container) return;

  if (!entriesMeta.length) {
    container.innerHTML = `<div class="empty-state-small">${escapeHtml(t('stats-empty'))}</div>`;
    return;
  }

  const weeks = 8;
  const diaryCounts = weeklyBuckets(entriesMeta.map(e => e.date), weeks);
  const pronTrend = pronunciationTrend(entriesMeta);
  const vocabSummary = computeVocabSummary();
  const vocabList = (typeof allVocab !== 'undefined' && allVocab) ? allVocab : [];
  const vocabTrend = vocabCumulativeTrend(vocabList, weeks);
  const catCounts = categoryFeedbackCounts(entriesMeta);
  const totalAnswers = vocabSummary.correctTotal + vocabSummary.wrongTotal;
  const accuracy = totalAnswers ? Math.round(vocabSummary.correctTotal / totalAnswers * 100) : null;
  const catMax = Math.max(...Object.values(catCounts), 1);
  const catColors = { grammar: 'var(--cat-grammar)', vocabulary: 'var(--cat-vocabulary)', expression: 'var(--cat-expression)', other: 'var(--cat-other)' };

  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">${escapeHtml(t('stats-diary-trend'))}</div>
        ${svgSparkline(diaryCounts, { color: 'var(--accent-mid)' })}
        <div class="stat-card-value">${entriesMeta.length}${escapeHtml(t('stats-entries-suffix'))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${escapeHtml(t('stats-vocab-trend'))}</div>
        ${svgSparkline(vocabTrend, { color: 'var(--secondary)' })}
        <div class="stat-card-value">${vocabSummary.count}${escapeHtml(t('stats-words-suffix'))}</div>
      </div>
      ${pronTrend.length ? `
      <div class="stat-card">
        <div class="stat-card-label">${escapeHtml(t('stats-pron-trend'))}</div>
        ${svgSparkline(pronTrend, { color: 'var(--success)' })}
        <div class="stat-card-value">${pronTrend[pronTrend.length - 1]}%</div>
      </div>` : ''}
      ${accuracy != null ? `
      <div class="stat-card">
        <div class="stat-card-label">${escapeHtml(t('stats-accuracy'))}</div>
        <div class="stat-card-big">${accuracy}%</div>
      </div>` : ''}
    </div>
    <div class="stat-card stat-card-wide">
      <div class="stat-card-label">${escapeHtml(t('stats-category'))}</div>
      <div class="stat-bars">
        ${Object.keys(catCounts).map(key => `
          <div class="stat-bar-row">
            <span class="stat-bar-label">${escapeHtml(t('cat-' + key))}</span>
            <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${catCounts[key] / catMax * 100}%;background:${catColors[key]}"></div></div>
            <span class="stat-bar-value">${catCounts[key]}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
