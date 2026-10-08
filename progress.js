'use strict';

// ── Progress data (streak / calendar / stats / XP) ─────────────────────────
// entries全件の軽量データ（本文テキストは含めない）。ストリーク・カレンダー・
// 統計・XP計算はすべてこの配列から算出する。
let entriesMeta = []; // [{id, date, pronunciation_first_attempt, feedback}]

// PostgRESTは上限を指定しないと1000行で黙って打ち切る。件数が増えたときに
// ストリークや統計が静かにずれるのを避けるため、明示的に上限を置く。
const ENTRIES_META_LIMIT = 2000;
// feedbackは添削内容を丸ごと持つ重いJSON。統計の内訳グラフにしか使わないので、
// 全件ではなく直近分だけ取得する（毎回の起動で全期間の添削を転送していた）。
const FEEDBACK_WINDOW = 120;

async function loadEntriesMeta() {
  const { data, error } = await sb.from('entries')
    .select('id,date,pronunciation_first_attempt')
    .order('date', { ascending: false })
    .limit(ENTRIES_META_LIMIT);
  if (error) {
    if (typeof showToast === 'function') showToast(t('error-load-entries'), 'error');
    return entriesMeta;
  }
  entriesMeta = data || [];
  return entriesMeta;
}

// 統計タブを開いたときだけ、直近分のfeedbackを取りに行って entriesMeta に混ぜる
let _feedbackLoaded = false;
async function loadFeedbackWindow() {
  if (_feedbackLoaded) return;
  const { data, error } = await sb.from('entries')
    .select('id,feedback')
    .order('date', { ascending: false })
    .limit(FEEDBACK_WINDOW);
  if (error) return;
  const byId = new Map((data || []).map(r => [r.id, r.feedback]));
  entriesMeta.forEach(e => { if (byId.has(e.id)) e.feedback = byId.get(e.id); });
  _feedbackLoaded = true;
}

// 日記を保存・編集したら次に統計を開いたときに取り直す
function invalidateFeedbackWindow() { _feedbackLoaded = false; }

// ── 英語ひとりごとのセッション（軽量データのみ） ──────────────────────────
// transcript と report は選ばない。60分のセッションは文字起こしだけで数十KBあり、
// 毎回の起動で転送すると重い（entries.feedback で同じ失敗をしたのを踏まえる）。
// レポートを開くときだけ、その1行をフルで取りに行く（openSoloSession）。
let soloMeta = []; // [{id, date, spoken_seconds, word_count, planned_minutes, report_status}]
const SOLO_META_LIMIT = 500;

async function loadSoloMeta() {
  const { data, error } = await sb.from('solo_sessions')
    .select('id,date,spoken_seconds,word_count,planned_minutes,report_status')
    .order('date', { ascending: false })
    .limit(SOLO_META_LIMIT);
  // solo_sessionsテーブルが未作成でもアプリ全体は動かす（この機能だけ空になる）
  if (error) return soloMeta;
  soloMeta = data || [];
  return soloMeta;
}

// 合計発話分数（XPとバッジの元データ）
function soloTotalMinutes(list) {
  return (list || []).reduce((n, s) => n + Math.round((s.spoken_seconds || 0) / 60), 0);
}

// ── 週の境界（月曜始まり・日曜終わり） ───────────────────────────────────
// weeklyBuckets() は「今日起点のローリング7日窓」で暦週ではないため、
// 週報はこちらを使う。'YYYY-MM-DD' はタイムゾーンを持たない暦日なので、
// computeStreaks と同じくUTC正午で扱ってDSTのズレを避ける。
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
function dayUTC(dateStr) { return new Date(dateStr + 'T12:00:00Z').getTime(); }
function dayStr(ms) { return new Date(ms).toISOString().split('T')[0]; }

// その日を含む週の月曜日を返す
function weekStartOf(dateStr) {
  const ms = dayUTC(dateStr);
  const dow = new Date(ms).getUTCDay();       // 0=日 .. 6=土
  const backToMonday = (dow + 6) % 7;         // 月=0, 日=6
  return dayStr(ms - backToMonday * ONE_DAY_MS);
}
function previousWeekStart(dateStr) {
  return dayStr(dayUTC(weekStartOf(dateStr)) - 7 * ONE_DAY_MS);
}
function weekDates(weekStartISO) {
  const start = dayUTC(weekStartISO);
  return Array.from({ length: 7 }, (_, i) => dayStr(start + i * ONE_DAY_MS));
}

// ── 週報の集計 ───────────────────────────────────────────────────────────
// DBに触らない純粋な関数。entries は [{date, jp, corrected, pronunciation_first_attempt}]、
// vocab は [{created_at}] を含む配列。テストから直接呼べる。
//
// 注意: 「クイズ正解◯問」は含めない。vocab.correct/wrong は累計値で日付別の記録が
// 無く、「先週何問正解したか」は既存データから算出できないため。
function computeWeeklyReport(weekStartISO, { entries = [], vocab = [] } = {}) {
  const days = weekDates(weekStartISO);
  const dayset = new Set(days);
  const weekEndISO = days[6];

  const inWeek = entries.filter(e => dayset.has(e.date));
  const daysWritten = new Set(inWeek.map(e => e.date)).size;

  const startMs = dayUTC(weekStartISO) - 12 * 3600 * 1000;      // 月曜 00:00 UTC
  const endMs   = dayUTC(weekEndISO) + 12 * 3600 * 1000;        // 日曜 24:00 UTC
  const newWords = (vocab || []).filter(v => {
    const ms = new Date(v.created_at || 0).getTime();
    return Number.isFinite(ms) && ms >= startMs && ms < endMs;
  }).length;

  const scores = inWeek
    .map(e => e.pronunciation_first_attempt?.score)
    .filter(s => typeof s === 'number');
  const bestPronunciation = scores.length ? Math.max(...scores) : null;

  // ハイライト: その週の添削済み英文から最も長い1文を引用する。
  // 分割は日記クイズと同じ splitSentences（略語のピリオドで切らない）を使う。
  let highlight = null;
  inWeek.forEach(e => {
    splitSentences(e.corrected)
      .filter(s => s.split(' ').length >= 4)
      .forEach(sentence => {
        if (!highlight || sentence.length > highlight.sentence.length) {
          highlight = { sentence, date: e.date };
        }
      });
  });

  // その週の中で何日連続して書けたか
  let bestRun = 0, run = 0;
  days.forEach(d => { run = dayset.has(d) && inWeek.some(e => e.date === d) ? run + 1 : 0; bestRun = Math.max(bestRun, run); });

  // 応援メッセージの出し分け（AI不使用）
  const tone = daysWritten >= 5 ? 'great' : daysWritten >= 2 ? 'good' : 'comeback';

  return {
    weekStart: weekStartISO, weekEnd: weekEndISO,
    entryCount: inWeek.length, daysWritten, newWords,
    bestPronunciation, bestRun, highlight, tone,
  };
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
function computeXp({ entriesMeta, vocabSummary, longestStreak, soloMeta }) {
  const pronGood = entriesMeta.filter(e => (e.pronunciation_first_attempt?.score ?? 0) >= 80).length;
  return entriesMeta.length * 15
    + vocabSummary.count * 3
    + vocabSummary.correctTotal * 2
    + pronGood * 5
    + Math.floor(longestStreak / 7) * 20
    // 発話1分あたり2XP。5分=10 / 30分=60 / 60分=120。日記1件の15XPと比べて、
    // 長く話すほど報われる重みにしてある。
    + soloTotalMinutes(soloMeta) * 2;
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
  { id: 'solo-first',       icon: '🎙', test: s => (s.soloMeta || []).length >= 1 },
  { id: 'solo-30min',       icon: '⏱', test: s => (s.soloMeta || []).some(x => (x.spoken_seconds || 0) >= 30 * 60) },
  { id: 'solo-total-300',   icon: '🏔', test: s => soloTotalMinutes(s.soloMeta) >= 300 },
];

function computeBadges(stats) {
  return BADGE_DEFS.map(def => ({ id: def.id, icon: def.icon, done: def.test(stats) }));
}

function computeProgressStats() {
  const vocabSummary = computeVocabSummary();
  const { longest } = computeStreaks(entriesMeta);
  const stats = { entriesMeta, vocabSummary, longestStreak: longest, soloMeta };
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
  return { count: list.length, correctTotal, wrongTotal, garden: computeGardenCounts(list) };
}

// srs_stage 0〜6 を 芽/双葉/つぼみ/花 の4段階に畳んで数える（Word Garden用）。
// app.js の SRS_STAGE_KEYS と対応。純粋な集計なのでテストから直接呼べる。
function computeGardenCounts(list) {
  const counts = { seed: 0, sprout: 0, bud: 0, bloom: 0 };
  (list || []).forEach(v => {
    const s = Math.max(0, Math.min(6, v.srs_stage || 0));
    if (s <= 1) counts.seed++;
    else if (s <= 3) counts.sprout++;
    else if (s <= 5) counts.bud++;
    else counts.bloom++;
  });
  return counts;
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
  document.getElementById('entries-speaking').style.display  = view === 'speaking' ? 'block' : 'none';
  if (view === 'calendar') renderEntriesCalendar();
  if (view === 'speaking') {
    renderSoloList();
    // 他のタブで増えたセッションも拾えるよう、開くたびに取り直す
    loadSoloMeta().then(renderSoloList);
  }
  if (view === 'stats') {
    renderStatsDashboard();
    // 添削内容の内訳グラフに必要なfeedbackはここで初めて取りに行く
    loadFeedbackWindow().then(() => renderStatsDashboard());
  }
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
  // 日記を書いた日と英語で話した日を別のドットで見分けられるようにする
  const soloDates = new Set(soloMeta.map(s => s.date));

  const monthLabel = getLang() === 'ja' ? `${year}年 ${month + 1}月` :
    new Date(year, month, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const weekdayLabels = getLang() === 'ja' ? ['日','月','火','水','木','金','土'] : ['S','M','T','W','T','F','S'];

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasEntry = Object.prototype.hasOwnProperty.call(dateToId, iso);
    const hasSolo  = soloDates.has(iso);
    const isToday = iso === todayISO();
    const dots = (hasEntry ? '<span class="cal-dot"></span>' : '')
               + (hasSolo ? '<span class="cal-dot cal-dot-solo"></span>' : '');
    // 日記がある日だけタップで開ける。話しただけの日は別クラスにして、
    // 押せそうに見えるのに何も起きない状態を避ける。
    const cls = hasEntry ? ' cal-has-entry' : (hasSolo ? ' cal-has-solo' : '');
    cells += `<div class="cal-cell${cls}${isToday ? ' cal-today' : ''}"
      ${hasEntry ? `onclick="openEntryDetail(${dateToId[iso]})"` : ''}>
      <span class="cal-daynum">${d}</span>${dots ? `<span class="cal-dots">${dots}</span>` : ''}
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
  // #entries-stats には週報を開くボタンが常設されているので、
  // グラフ本体はその内側の専用コンテナにだけ描く。
  const container = document.getElementById('entries-stats-body');
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

// ── コトラの週報（ローカル集計のみ・AI不使用） ─────────────────────────────
// entriesMeta は Phase 2 で本文（corrected）を持たなくなったため、
// 週報を開くときだけ対象週の日記を別途取得する（7件程度の軽いクエリ）。
async function fetchWeekEntries(weekStartISO) {
  const days = weekDates(weekStartISO);
  const { data, error } = await sb.from('entries')
    .select('id,date,jp,corrected,pronunciation_first_attempt')
    .gte('date', days[0])
    .lte('date', days[6])
    .order('date', { ascending: true })
    .limit(50);
  if (error) { showToast(t('error-load-entries'), 'error'); return null; }
  return data || [];
}

let _weeklyShownWeek = null;

// 直近の「閉じた週」＝先週。月曜に週が切り替わる。
function lastCompletedWeekStart() { return previousWeekStart(todayISO()); }

async function openWeeklyReport(weekStartISO) {
  const weekStart = weekStartISO || lastCompletedWeekStart();
  const entries = await fetchWeekEntries(weekStart);
  if (entries === null) return;

  const vocab = (typeof allVocab !== 'undefined' && allVocab) ? allVocab : [];
  const report = computeWeeklyReport(weekStart, { entries, vocab });
  _weeklyShownWeek = weekStart;

  renderWeeklyReport(report);
  openModal('weekly-modal');
  // 既読にする（同じ週の通知を繰り返さない）
  LS.set('weeklyReport:' + weekStart, '1');
  const badge = document.getElementById('weekly-home-cta');
  if (badge) badge.style.display = 'none';
}

function renderWeeklyReport(r) {
  const body = document.getElementById('weekly-modal-body');
  if (!body) return;

  const range = `${fmtShortDate(r.weekStart)} – ${fmtShortDate(r.weekEnd)}`;
  const stage = (typeof computeProgressStats === 'function') ? computeProgressStats() : null;
  const kotora = (typeof kotoraImg === 'function' && stage)
    ? kotoraImg(r.daysWritten >= 2 ? 'delighted' : 'idle',
        mascotCollarTier(stage.level), mascotGrowthStage(stage.level))
    : '';

  // 数字カード。値が無いものは出さない（0件表示で落ち込ませない）
  const cards = [
    { key: 'weekly-stat-days',  value: r.daysWritten, suffix: t('weekly-unit-days') },
    { key: 'weekly-stat-words', value: r.newWords,    suffix: t('weekly-unit-words') },
  ];
  if (r.bestPronunciation !== null) {
    cards.push({ key: 'weekly-stat-pron', value: r.bestPronunciation, suffix: t('weekly-unit-score') });
  }
  if (r.bestRun >= 2) {
    cards.push({ key: 'weekly-stat-run', value: r.bestRun, suffix: t('weekly-unit-days') });
  }

  body.innerHTML = `
    <div class="weekly-hero weekly-card">
      <div class="weekly-kotora">${kotora}</div>
      <div class="weekly-range">${escapeHtml(range)}</div>
      <div class="weekly-headline">${escapeHtml(t('weekly-headline').replace('{n}', r.daysWritten))}</div>
    </div>
    <div class="stat-grid weekly-stats">
      ${cards.map(c => `
        <div class="stat-card weekly-card">
          <div class="stat-card-label">${escapeHtml(t(c.key))}</div>
          <div class="stat-card-big" data-weekly-to="${c.value}">0</div>
          <div class="stat-card-value">${escapeHtml(c.suffix)}</div>
        </div>
      `).join('')}
    </div>
    ${r.highlight ? `
      <div class="weekly-quote weekly-card">
        <div class="stat-card-label">${escapeHtml(t('weekly-highlight'))}</div>
        <blockquote class="weekly-quote-text">${escapeHtml(r.highlight.sentence)}</blockquote>
        <div class="weekly-quote-date">${escapeHtml(fmtShortDate(r.highlight.date))}</div>
      </div>` : ''}
    <p class="weekly-message">${escapeHtml(ktLine('weekly-' + r.tone) || '')}</p>
  `;

  // 数字をカウントアップさせる（reduced-motion時は animateNumber 側が即座に確定させる）
  if (typeof animateNumber === 'function') {
    body.querySelectorAll('[data-weekly-to]').forEach(el => {
      animateNumber(el, 0, Number(el.dataset.weeklyTo) || 0, 700);
    });
  }
}

function closeWeeklyReport() {
  closeModal('weekly-modal');
  if (typeof burstConfetti === 'function') burstConfetti();
}

// 週が明けて最初にホームを開いたとき、コトラが知らせる。
// モーダルを勝手に開かず、ホームに導線を出すだけにする。
function checkWeeklyReport() {
  const weekStart = lastCompletedWeekStart();
  const cta = document.getElementById('weekly-home-cta');
  if (!cta) return;
  const unread = LS.get('weeklyReport:' + weekStart) !== '1';
  // 先週1日も書いていないなら通知しない（いきなり責められている感じになるため）
  const wroteLastWeek = entriesMeta.some(e => weekDates(weekStart).includes(e.date));
  cta.style.display = unread && wroteLastWeek ? 'flex' : 'none';
  if (unread && wroteLastWeek && typeof kotoraSay === 'function') {
    kotoraSay('home-kotora', 'weekly-ready', { once: true });
  }
}

// ── 履歴タブ: スピーキング一覧 ────────────────────────────────────────────
function renderSoloList() {
  const el = document.getElementById('entries-speaking');
  if (!el) return;

  if (!soloMeta.length) {
    el.innerHTML = `<div class="empty-state-small">${escapeHtml(t('solo-list-empty'))}</div>`;
    return;
  }

  const totalMin = soloTotalMinutes(soloMeta);
  const header = `
    <div class="quiz-stats-row">
      <span class="stat-chip">${escapeHtml(t('solo-list-sessions'))} <strong>${soloMeta.length}</strong></span>
      <span class="stat-chip">${escapeHtml(t('solo-list-total'))} <strong>${totalMin}</strong>${escapeHtml(t('solo-unit-min'))}</span>
    </div>`;

  el.innerHTML = header + soloMeta.map(s => {
    const minutes = Math.max(1, Math.round((s.spoken_seconds || 0) / 60));
    const failed = s.report_status === 'failed';
    return `
      <button type="button" class="solo-list-card" onclick="openSoloSession(${s.id})">
        <div class="solo-list-top">
          <span class="solo-list-date">${escapeHtml(fmtShortDate(s.date))}</span>
          <span class="solo-list-min">${minutes}${escapeHtml(t('solo-unit-min'))}</span>
        </div>
        <div class="solo-list-sub">
          ${escapeHtml(t('solo-count-words'))} ${s.word_count || 0}
          ${failed ? ` ・ <span class="solo-list-failed">${escapeHtml(t('solo-list-no-report'))}</span>` : ''}
        </div>
      </button>`;
  }).join('');
}
