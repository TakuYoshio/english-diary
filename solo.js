'use strict';

// ── 英語独り言モード（Solo Talk / イマージョン） ──────────────────────────────
// 時間を選んで英語で話し続け、話した内容をテキストとして残し、終了時にAIが
// 添削レポートを返す。セッション中はAIを一切呼ばない（運用費と遅延のため）。
//
// この機能でいちばん難しいのはAIではなく音声認識の継続。対象端末が
// iPhone Safari と Android Chrome なので、以下が避けられない:
//   - 認識は30〜60秒で勝手に終了する。30分で60〜200回の再起動が起きる
//   - iOSではユーザー操作を伴わない .start() が無言で失敗することがある
//   - 再起動のたびに0.3秒前後を取りこぼす（Web Speech APIでは回避不可）
// そのため「お題ごとの区切り」で自然にマイクを張り直す構成にし、
// 自動再開が効かない場合は必ず手動で続けられる状態を残す。

const SOLO_DURATIONS = [5, 10, 30, 60];
const SOLO_LONG_MINUTES = 30;          // これ以上は初回に注意モーダルを出す
const SOLO_SILENCE_NUDGE_MS = 45000;   // 無言が続いたらコトラが声をかける
const SOLO_AUTOSAVE_MS = 5000;
const SOLO_DRAFT_KEY = 'soloDraft';
const SOLO_MAX_TRANSCRIPT_CHARS = 60000; // Worker側の上限に合わせる

// 再接続のバックオフ（ms）。onend 直後の即 start() は InvalidStateError を投げる。
const SOLO_BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000];
// これだけ連続で再開して結果が0件なら、自動再開をあきらめてタップ再開に切り替える
const SOLO_DEAD_AFTER_FAILURES = 5;

// 認識が終了したとき、エラー種別ごとにどう扱うか。
// 自動再開してよいもの（通常運転で普通に起きる）と、権限やデバイスの問題で
// 再開しても無意味なものを分ける。
const SOLO_RECOVERABLE_ERRORS = new Set(['no-speech', 'aborted', 'network', '']);
const SOLO_FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed']);

// iOSはユーザー操作を伴わない .start() が無言で失敗するため、
// 自動再開に頼らずタップでの再開を前面に出す。
function soloIsIOS() {
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua)
    // iPadOS 13+ はMacを名乗るのでタッチの有無で見分ける
    || (/Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1);
}

function soloSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ── 発話の集計（純粋関数・テストから直接呼べる） ────────────────────────────
const SOLO_FILLERS = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'i mean', 'kind of', 'sort of'];

function soloCountWords(text) {
  const m = String(text || '').trim().match(/[A-Za-z']+/g);
  return m ? m.length : 0;
}

function soloCountFillers(text) {
  const lower = ' ' + String(text || '').toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  return SOLO_FILLERS.reduce((n, f) => {
    const re = new RegExp('\\s' + f.replace(/ /g, '\\s') + '\\s', 'g');
    return n + (lower.match(re) || []).length;
  }, 0);
}

function soloWpm(wordCount, elapsedMs) {
  const minutes = elapsedMs / 60000;
  return minutes > 0.1 ? Math.round(wordCount / minutes) : 0;
}

// 蓄積した発話セグメントを1本のテキストにする
function soloJoinSegments(segments) {
  return (segments || []).map(s => String(s.text || '').trim()).filter(Boolean).join(' ');
}

// レポートが長すぎるときは真ん中を落とす。頭と終わりは話の流れが分かるよう残す。
function soloTruncateTranscript(text, max = SOLO_MAX_TRANSCRIPT_CHARS) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const half = Math.floor((max - 40) / 2);
  return s.slice(0, half) + '\n…(中略)…\n' + s.slice(-half);
}

// ── SoloMic ──────────────────────────────────────────────────────────────
// app.js の startMic/stopMic は continuous=false の単発用で、モジュール
// グローバルの recognition/isRecording を共有し、onresult で e.results を
// 毎回全走査する。そのまま流用すると再開時に文字が重複または消失するため、
// ここは完全に独立した実装にする（app.js側は一切変更しない）。
function createSoloMic({ onSegment, onInterim, onStateChange, lang = 'en-US' } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  let rec = null;
  let state = 'idle';          // idle | running | reconnecting | needs-tap | paused | dead
  let starting = false;        // start()の二重呼び出し防止
  let failures = 0;            // 結果を得られないまま連続で再開した回数
  let gotResultSinceStart = false;
  let backoffTimer = null;
  let startedAt = 0;

  const segments = [];
  let interim = '';

  const setState = (next) => {
    if (state === next) return;
    state = next;
    if (onStateChange) onStateChange(state);
  };

  function buildRecognition() {
    const r = new SR();
    r.lang = lang;
    // continuous は端末によって無視されるが、効く環境では再開回数が減る
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      // 再開のたびにインデックスは0に戻る。resultIndex から読まないと
      // 既に確定した分を二重に拾ってしまう。
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0] ? res[0].transcript : '';
        if (res.isFinal) {
          const trimmed = String(text).trim();
          if (trimmed) {
            gotResultSinceStart = true;
            failures = 0;
            segments.push({
              t: Date.now() - startedAt,
              text: trimmed,
              conf: res[0] ? res[0].confidence : null,
              source: 'speech',
            });
            if (onSegment) onSegment(segments[segments.length - 1]);
          }
        } else {
          pending += text;
        }
      }
      interim = pending.trim();
      if (onInterim) onInterim(interim);
    };

    r.onerror = (e) => {
      const err = (e && e.error) || '';
      if (SOLO_FATAL_ERRORS.has(err)) {
        // マイク権限が無い／ブロックされた。再開しても無意味なので終了する。
        stopRecognition();
        setState('dead');
        return;
      }
      // audio-capture は他アプリがマイクを掴んだ場合。数回だけ粘る。
      if (!SOLO_RECOVERABLE_ERRORS.has(err) && err !== 'audio-capture') failures++;
    };

    r.onend = () => {
      starting = false;
      if (!gotResultSinceStart) failures++;
      if (state === 'running' || state === 'reconnecting') scheduleRestart();
    };
    return r;
  }

  function scheduleRestart() {
    if (failures >= SOLO_DEAD_AFTER_FAILURES) {
      // 自動再開が効いていない（iOSでよく起きる）。タップで再開してもらう。
      setState('needs-tap');
      return;
    }
    setState('reconnecting');
    const wait = SOLO_BACKOFF_MS[Math.min(failures, SOLO_BACKOFF_MS.length - 1)];
    clearTimeout(backoffTimer);
    backoffTimer = setTimeout(() => {
      if (state !== 'reconnecting') return;
      startRecognition();
    }, wait);
  }

  function startRecognition() {
    if (starting || !SR) return;
    starting = true;
    gotResultSinceStart = false;
    try {
      rec = buildRecognition();
      rec.start();
      setState('running');
    } catch {
      // InvalidStateError など。バックオフしてやり直す。
      starting = false;
      failures++;
      scheduleRestart();
    }
  }

  function stopRecognition() {
    clearTimeout(backoffTimer);
    starting = false;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.stop(); } catch { /* 既に停止している */ }
      rec = null;
    }
  }

  return {
    get state() { return state; },
    get segments() { return segments; },
    get interim() { return interim; },
    get supported() { return !!SR; },

    start() {
      if (!SR) { setState('dead'); return false; }
      startedAt = startedAt || Date.now();
      failures = 0;
      startRecognition();
      return true;
    },
    // 「続ける🎙」ボタンから呼ぶ。ユーザー操作の起点になるので
    // iOSでも .start() が通る。
    resume() {
      failures = 0;
      stopRecognition();
      startRecognition();
    },
    pause() {
      setState('paused');
      stopRecognition();
    },
    stop() {
      setState('idle');
      stopRecognition();
    },
    // タイピングで入力したぶんも同じバッファに積む
    addTyped(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return;
      segments.push({ t: Date.now() - (startedAt || Date.now()), text: trimmed, conf: null, source: 'typing' });
      if (onSegment) onSegment(segments[segments.length - 1]);
    },
    transcript() { return soloJoinSegments(segments); },
    // 復帰用に読み込む
    restore(saved) {
      (saved || []).forEach(seg => segments.push(seg));
    },
    inputMethod() {
      const kinds = new Set(segments.map(s => s.source));
      if (kinds.size > 1) return 'mixed';
      return kinds.has('typing') ? 'typing' : 'speech';
    },
  };
}

// ── お題（完全ローカル・AI不使用） ────────────────────────────────────────
// 「自分の環境を英語にして没頭する」ための素材。特に "surroundings" は
// 目の前にあるものを実況するお題だけで構成してある。
const SOLO_PACKS = {
  mixed:        { key: 'mixed' },
  today:        { key: 'today' },
  work:         { key: 'work' },
  surroundings: { key: 'surroundings' },
  free:         { key: 'free' },
};

const SOLO_PROMPTS = {
  today: [
    { en: 'What did you do first thing this morning?', jp: '今朝いちばんにしたことは？' },
    { en: 'Tell me about something that surprised you today.', jp: '今日おどろいたことは？' },
    { en: 'What was the best part of your day so far?', jp: '今日いちばん良かったことは？' },
    { en: 'Describe a person you talked to today.', jp: '今日話した人のことを説明してみよう' },
    { en: 'What did you eat today? Describe how it tasted.', jp: '今日食べたものと、その味を説明してみよう' },
    { en: 'What is something you postponed today, and why?', jp: '今日後回しにしたことと、その理由は？' },
  ],
  work: [
    { en: 'What are you working on right now?', jp: '今とりくんでいることは？' },
    { en: 'Explain a problem you are trying to solve.', jp: '今解こうとしている問題を説明してみよう' },
    { en: 'What did you learn recently? Teach it to me.', jp: '最近学んだことを教えるつもりで話そう' },
    { en: 'Describe your ideal working day.', jp: '理想の1日の働き方を説明してみよう' },
    { en: 'What skill do you want to improve, and how?', jp: '伸ばしたいスキルと、その方法は？' },
  ],
  surroundings: [
    { en: 'Look around you. Describe three things you can see.', jp: '周りを見て、見えるものを3つ説明してみよう' },
    { en: 'Describe the room you are in right now.', jp: '今いる部屋を説明してみよう' },
    { en: 'What can you hear right now?', jp: '今どんな音が聞こえる？' },
    { en: 'Describe what you are wearing and why you chose it.', jp: '今着ているものと、それを選んだ理由は？' },
    { en: 'Pick up an object near you. Explain what it is for.', jp: '近くのものを手に取って、何のためのものか説明してみよう' },
    { en: 'Describe the weather and how it makes you feel.', jp: '今日の天気と、それをどう感じるか' },
  ],
  free: [
    { en: 'Just keep talking about anything on your mind.', jp: '頭に浮かんだことを自由に話し続けよう' },
  ],
};

// 話し出しに詰まったときのチップ
const SOLO_STARTERS = ['Right now I…', 'It makes me think…', 'The thing is…', 'What I mean is…'];

// 時間ごとのお題の切り替え回数。多すぎると落ち着かず、少なすぎると飽きる。
const SOLO_PROMPT_COUNT = { 5: 2, 10: 3, 30: 6, 60: 10 };

function soloPromptsFor(pack, minutes) {
  const n = SOLO_PROMPT_COUNT[minutes] || 3;
  if (pack === 'free') return Array.from({ length: n }, () => SOLO_PROMPTS.free[0]);
  const source = pack === 'mixed'
    ? [...SOLO_PROMPTS.today, ...SOLO_PROMPTS.work, ...SOLO_PROMPTS.surroundings]
    : (SOLO_PROMPTS[pack] || SOLO_PROMPTS.today);
  const shuffled = source.slice().sort(() => Math.random() - 0.5);
  // 足りなければ繰り返して埋める
  return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length]);
}

// お題を出すタイミング（ミリ秒）。等間隔に割る。
function soloPromptSchedule(minutes) {
  const n = SOLO_PROMPT_COUNT[minutes] || 3;
  const totalMs = minutes * 60000;
  return Array.from({ length: n }, (_, i) => Math.round((totalMs / n) * i));
}

// ── セッションの状態 ──────────────────────────────────────────────────────
const soloSession = {
  active: false,
  mic: null,
  minutes: 5,
  pack: 'mixed',
  typingOnly: false,
  startedAt: 0,
  pausedTotal: 0,
  pausedAt: 0,
  prompts: [],
  schedule: [],
  promptIndex: -1,
  promptsUsed: [],
  tickTimer: null,
  autosaveTimer: null,
  lastSegmentAt: 0,
  nudges: 0,
  milestonesDone: 0,
  wakeLock: null,
};

function soloSetView(id) {
  ['solo-setup-view', 'solo-live-view', 'solo-processing-view', 'solo-report-view'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? 'block' : 'none';
  });
}

// タイマーはバックグラウンドで絞られるので、必ず実時間の差分から求める
function soloElapsedMs() {
  if (!soloSession.startedAt) return 0;
  const pausedNow = soloSession.pausedAt ? Date.now() - soloSession.pausedAt : 0;
  return Date.now() - soloSession.startedAt - soloSession.pausedTotal - pausedNow;
}

function soloFormatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── 設定画面 ──────────────────────────────────────────────────────────────
function openSoloTab() {
  soloSetView('solo-setup-view');
  renderSoloSetup();
  if (typeof mascotSetMood === 'function') mascotSetMood('solo-intro-mascot', 'excited');
  if (typeof kotoraSay === 'function') kotoraSay('solo-intro-mascot', 'solo-intro', { once: true });
}

function renderSoloSetup() {
  const durEl = document.getElementById('solo-duration-chips');
  if (durEl) {
    durEl.innerHTML = SOLO_DURATIONS.map(m => `
      <button type="button" class="solo-chip${m === soloSession.minutes ? ' active' : ''}"
        onclick="soloPickDuration(${m})" aria-pressed="${m === soloSession.minutes}">
        ${m}<span class="solo-chip-unit">${escapeHtml(t('solo-unit-min'))}</span>
      </button>`).join('');
  }
  const packEl = document.getElementById('solo-pack-chips');
  if (packEl) {
    packEl.innerHTML = Object.keys(SOLO_PACKS).map(k => `
      <button type="button" class="solo-chip${k === soloSession.pack ? ' active' : ''}"
        onclick="soloPickPack('${k}')" aria-pressed="${k === soloSession.pack}">
        ${escapeHtml(t('solo-pack-' + k))}
      </button>`).join('');
  }
  const unsupported = document.getElementById('solo-unsupported');
  if (unsupported) unsupported.style.display = soloSpeechSupported() ? 'none' : 'block';

  renderSoloResumeBanner();
}

function soloPickDuration(m) {
  soloSession.minutes = m;
  renderSoloSetup();
  // 30分以上は初回だけ注意を出す（画面消灯・電池・取りこぼし・Androidの通知音）
  if (m >= SOLO_LONG_MINUTES && LS.get('soloLongWarned') !== '1') {
    showConfirm({ message: t('solo-long-warning'), okLabel: t('solo-long-ok') })
      .then(ok => { if (ok) LS.set('soloLongWarned', '1'); });
  }
}

function soloPickPack(k) { soloSession.pack = k; renderSoloSetup(); }

// ── 中断したセッションの復帰 ──────────────────────────────────────────────
function soloReadDraft() {
  try {
    const raw = LS.get(SOLO_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function renderSoloResumeBanner() {
  const banner = document.getElementById('solo-resume-banner');
  if (!banner) return;
  const draft = soloReadDraft();
  if (!draft || !draft.segments || !draft.segments.length) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  document.getElementById('solo-resume-text').textContent =
    t('solo-resume-text')
      .replace('{min}', draft.plannedMinutes)
      .replace('{words}', soloCountWords(soloJoinSegments(draft.segments)));
}

function soloDiscardDraft() {
  LS.set(SOLO_DRAFT_KEY, '');
  renderSoloResumeBanner();
}

function soloSaveDraft() {
  if (!soloSession.active) return;
  try {
    LS.set(SOLO_DRAFT_KEY, JSON.stringify({
      startedAt: soloSession.startedAt,
      plannedMinutes: soloSession.minutes,
      pack: soloSession.pack,
      promptsUsed: soloSession.promptsUsed,
      spokenSeconds: Math.round(soloElapsedMs() / 1000),
      segments: soloSession.mic ? soloSession.mic.segments : [],
    }));
  } catch { /* 容量超過。次のセグメントでまた試す。 */ }
}

// ── セッション開始 ────────────────────────────────────────────────────────
async function soloStartSession(typingOnly = false) {
  soloSession.typingOnly = !!typingOnly || !soloSpeechSupported();
  soloSession.active = true;
  soloSession.startedAt = Date.now();
  soloSession.pausedTotal = 0;
  soloSession.pausedAt = 0;
  soloSession.promptIndex = -1;
  soloSession.promptsUsed = [];
  soloSession.nudges = 0;
  soloSession.milestonesDone = 0;
  soloSession.lastSegmentAt = Date.now();
  soloSession.prompts = soloPromptsFor(soloSession.pack, soloSession.minutes);
  soloSession.schedule = soloPromptSchedule(soloSession.minutes);

  soloSession.mic = createSoloMic({
    onSegment: () => {
      soloSession.lastSegmentAt = Date.now();
      soloSession.nudges = 0;
      renderSoloCounters();
      renderSoloTranscript();
    },
    onInterim: renderSoloTranscript,
    onStateChange: renderSoloMicChip,
  });

  soloSetView('solo-live-view');
  document.getElementById('solo-typing').style.display = soloSession.typingOnly ? 'block' : 'none';
  soloNextPrompt();
  renderSoloCounters();
  renderSoloTranscript();

  if (!soloSession.typingOnly) soloSession.mic.start();
  renderSoloMicChip();

  await soloRequestWakeLock();
  soloSession.tickTimer = setInterval(soloTick, 250);
  soloSession.autosaveTimer = setInterval(soloSaveDraft, SOLO_AUTOSAVE_MS);
  document.addEventListener('visibilitychange', soloOnVisibilityChange);

  if (typeof mascotSetMood === 'function') mascotSetMood('solo-mascot', 'excited');
  if (typeof kotoraSay === 'function') kotoraSay('solo-mascot', 'solo-start');
}

// ── 画面の更新 ────────────────────────────────────────────────────────────
const SOLO_RING_CIRCUMFERENCE = 2 * Math.PI * 54;

function soloTick() {
  if (!soloSession.active) return;
  const elapsed = soloElapsedMs();
  const totalMs = soloSession.minutes * 60000;
  const remaining = Math.max(0, totalMs - elapsed);

  document.getElementById('solo-time').textContent = soloFormatClock(remaining);
  const bar = document.getElementById('solo-ring-bar');
  if (bar) {
    const pct = Math.min(1, elapsed / totalMs);
    bar.style.strokeDasharray = `${SOLO_RING_CIRCUMFERENCE}`;
    bar.style.strokeDashoffset = `${SOLO_RING_CIRCUMFERENCE * pct}`;
    bar.classList.toggle('solo-ring-ending', remaining <= totalMs * 0.1);
  }
  renderSoloCounters();

  // お題の切り替え
  const nextIdx = soloSession.schedule.filter(at => elapsed >= at).length - 1;
  if (nextIdx > soloSession.promptIndex) soloNextPrompt(nextIdx);

  // 5分ごとのマイルストーン
  const milestone = Math.floor(elapsed / 300000);
  if (milestone > soloSession.milestonesDone && remaining > 0) {
    soloSession.milestonesDone = milestone;
    if (typeof burstConfetti === 'function') burstConfetti();
    if (typeof floatXpText === 'function') floatXpText('+5 XP');
    if (typeof kotoraSay === 'function') kotoraSay('solo-mascot', 'solo-milestone', { vars: { n: milestone * 5 } });
  }

  // 無言が続いたら声をかける
  if (!soloSession.typingOnly && Date.now() - soloSession.lastSegmentAt > SOLO_SILENCE_NUDGE_MS) {
    soloSession.lastSegmentAt = Date.now();
    soloSession.nudges++;
    if (typeof kotoraSay === 'function') kotoraSay('solo-mascot', 'solo-silence');
    if (soloSession.nudges >= 3) soloNextPrompt();
  }

  if (remaining <= 0) soloFinishSession();
}

function renderSoloMicChip() {
  const chip = document.getElementById('solo-mic-chip');
  const tapBtn = document.getElementById('solo-tap-resume');
  if (!chip) return;
  const st = soloSession.typingOnly ? 'typing' : (soloSession.mic ? soloSession.mic.state : 'idle');
  const map = {
    running:      { key: 'solo-mic-listening',    cls: 'solo-mic-ok' },
    reconnecting: { key: 'solo-mic-reconnecting', cls: 'solo-mic-warn' },
    'needs-tap':  { key: 'solo-mic-needs-tap',    cls: 'solo-mic-warn' },
    paused:       { key: 'solo-mic-paused',       cls: '' },
    dead:         { key: 'solo-mic-dead',         cls: 'solo-mic-bad' },
    typing:       { key: 'solo-mic-typing',       cls: '' },
    idle:         { key: 'solo-mic-paused',       cls: '' },
  };
  const conf = map[st] || map.idle;
  chip.textContent = t(conf.key);
  chip.className = 'solo-mic-chip ' + conf.cls;

  // 自動再開が効かないときだけ、タップで続ける導線を前に出す
  if (tapBtn) tapBtn.style.display = (st === 'needs-tap' || st === 'dead') ? 'block' : 'none';
  // 認識が死んだらタイピングに逃がす
  if (st === 'dead') document.getElementById('solo-typing').style.display = 'block';
}

function soloTapResume() {
  if (!soloSession.mic) return;
  if (!soloSession.mic.supported) { soloToggleTyping(true); return; }
  soloSession.mic.resume();
  renderSoloMicChip();
}

function renderSoloCounters() {
  const text = soloSession.mic ? soloSession.mic.transcript() : '';
  const words = soloCountWords(text);
  document.getElementById('solo-words').textContent = words;
  document.getElementById('solo-wpm').textContent = soloWpm(words, soloElapsedMs());
  document.getElementById('solo-fillers').textContent = soloCountFillers(text);
}

function renderSoloTranscript() {
  const el = document.getElementById('solo-transcript');
  if (!el || !soloSession.mic) return;
  // 直近5件だけ見せる（全部出すと長いセッションで重くなる）
  const recent = soloSession.mic.segments.slice(-5)
    .map(s => `<span class="solo-line">${escapeHtml(s.text)}</span>`).join(' ');
  const interim = soloSession.mic.interim
    ? ` <span class="solo-line-interim">${escapeHtml(soloSession.mic.interim)}</span>` : '';
  el.innerHTML = recent + interim;
  el.scrollTop = el.scrollHeight;
}

function soloNextPrompt(index) {
  const i = typeof index === 'number' ? index : soloSession.promptIndex + 1;
  soloSession.promptIndex = i;
  const prompt = soloSession.prompts[i % soloSession.prompts.length];
  if (!prompt) return;
  soloSession.promptsUsed.push(prompt.en);

  const card = document.getElementById('solo-prompt-card');
  document.getElementById('solo-prompt-en').textContent = prompt.en;
  document.getElementById('solo-prompt-jp').textContent = prompt.jp;
  document.getElementById('solo-starters').innerHTML =
    SOLO_STARTERS.map(s => `<span class="solo-starter">${escapeHtml(s)}</span>`).join('');

  if (card && typeof fxReducedMotion === 'function' && !fxReducedMotion()) {
    card.classList.remove('solo-prompt-flip');
    void card.offsetWidth;
    card.classList.add('solo-prompt-flip');
  }
  if (soloSession.promptIndex > 0 && typeof kotoraSay === 'function') {
    kotoraSay('solo-mascot', 'solo-prompt-next');
  }
}

// ── 一時停止・タイピング・画面制御 ────────────────────────────────────────
function soloTogglePause() {
  if (!soloSession.active) return;
  const btn = document.getElementById('solo-pause-btn');
  if (soloSession.pausedAt) {
    soloSession.pausedTotal += Date.now() - soloSession.pausedAt;
    soloSession.pausedAt = 0;
    // 再開はユーザー操作起点なのでiOSでも .start() が通る
    if (!soloSession.typingOnly && soloSession.mic) soloSession.mic.resume();
    soloRequestWakeLock();
    if (btn) btn.textContent = t('solo-pause');
  } else {
    soloSession.pausedAt = Date.now();
    if (soloSession.mic) soloSession.mic.pause();
    soloReleaseWakeLock();
    if (btn) btn.textContent = t('solo-resume');
  }
  renderSoloMicChip();
}

function soloToggleTyping(forceOn) {
  const box = document.getElementById('solo-typing');
  const on = forceOn === true || box.style.display === 'none';
  box.style.display = on ? 'block' : 'none';
  if (on) document.getElementById('solo-typing-input').focus({ preventScroll: true });
}

function soloCommitTyping() {
  const input = document.getElementById('solo-typing-input');
  const text = input.value.trim();
  if (!text) return;
  soloSession.mic.addTyped(text);
  input.value = '';
  soloSaveDraft();
}

// 画面が消えると認識は止まる。Wake Lock はタブが隠れると自動解放されるので
// visibilitychange で取り直す。Safari 16.4+ / Chrome で使える。
async function soloRequestWakeLock() {
  if (!navigator.wakeLock || soloSession.wakeLock) return;
  try {
    soloSession.wakeLock = await navigator.wakeLock.request('screen');
    soloSession.wakeLock.addEventListener('release', () => { soloSession.wakeLock = null; });
  } catch {
    // 取得できなくてもセッションは続行する（画面が消えないよう案内だけ出す）
    showToast(t('solo-wakelock-hint'), 'info');
  }
}

function soloReleaseWakeLock() {
  if (!soloSession.wakeLock) return;
  try { soloSession.wakeLock.release(); } catch { /* すでに解放済み */ }
  soloSession.wakeLock = null;
}

let _soloHiddenAt = 0;
function soloOnVisibilityChange() {
  if (!soloSession.active) return;
  if (document.visibilityState === 'hidden') {
    _soloHiddenAt = Date.now();
    return;
  }
  soloRequestWakeLock();
  // 通知を一瞬見ただけでセッションを潰さないよう、10秒の猶予を置く
  const away = Date.now() - _soloHiddenAt;
  if (away > 10000 && !soloSession.pausedAt) {
    soloTogglePause();
    showToast(t('solo-auto-paused'), 'warn');
  } else if (!soloSession.pausedAt && !soloSession.typingOnly && soloSession.mic) {
    soloSession.mic.resume();
  }
}

function soloTeardown() {
  clearInterval(soloSession.tickTimer);
  clearInterval(soloSession.autosaveTimer);
  soloSession.tickTimer = soloSession.autosaveTimer = null;
  document.removeEventListener('visibilitychange', soloOnVisibilityChange);
  soloReleaseWakeLock();
  if (soloSession.mic) soloSession.mic.stop();
  soloSession.active = false;
}

// タブを離れたらセッションを畳む（マイクを掴んだままにしない）
function soloAbandonIfRunning() {
  if (!soloSession.active) return;
  soloSaveDraft();
  soloTeardown();
}

// ── レポート ──────────────────────────────────────────────────────────────
// Geminiのレスポンススキーマ。category の enum は日記の添削
// （DETAILED_FEEDBACK_SCHEMA）と意図的に揃えてあるので、
// --cat-* のCSS変数と t('cat-'+key) のラベルがそのまま使える。
const SOLO_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary_jp:     { type: 'string' },
    stats: {
      type: 'object',
      properties: {
        fluency_score:  { type: 'integer' },
        variety_score:  { type: 'integer' },
        accuracy_score: { type: 'integer' },
        used_vocab:     { type: 'array', items: { type: 'string' } },
      },
      required: ['fluency_score', 'variety_score', 'accuracy_score'],
    },
    good_expressions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, why_jp: { type: 'string' } },
        required: ['text', 'why_jp'],
      },
    },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          before: { type: 'string' }, after: { type: 'string' },
          explanation_jp: { type: 'string' },
          category: { type: 'string', enum: ['grammar', 'vocabulary', 'expression', 'other'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['before', 'after', 'explanation_jp', 'category', 'confidence'],
      },
    },
    upgrade_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { you_said: { type: 'string' }, native_way: { type: 'string' } },
        required: ['you_said', 'native_way'],
      },
    },
    suggested_vocab: {
      type: 'array',
      items: {
        type: 'object',
        properties: { en: { type: 'string' }, jp: { type: 'string' }, note: { type: 'string' } },
        required: ['en', 'jp'],
      },
    },
    next_time_focus_jp: { type: 'string' },
  },
  required: ['summary_jp', 'stats', 'good_expressions', 'corrections', 'suggested_vocab', 'next_time_focus_jp'],
};

// レポートを作るのに必要な最低ライン。これ未満はAIを呼ばない。
const SOLO_MIN_SECONDS = 60;
const SOLO_MIN_WORDS = 40;
const SOLO_REPORTS_PER_DAY = 3;

function buildSoloReportPrompt({ transcript, minutes, spokenSeconds, wordCount, prompts, dueWords, skillFocus }) {
  return `A Japanese learner of English spoke English alone for ${Math.round(spokenSeconds / 60)} minutes (planned ${minutes} minutes), producing about ${wordCount} words.

The prompts they were shown: ${(prompts || []).slice(0, 6).join(' / ') || '(none)'}
Words currently in their vocabulary list, due for review: ${(dueWords || []).join(', ') || '(none)'}
${skillFocus && skillFocus.length ? `They want to improve: ${skillFocus.join(', ')}.` : ''}

IMPORTANT — how to read the text below:
This text is the raw output of browser speech recognition. It has no punctuation, no capitalization, and it contains transcription errors the speaker did not make (misheard words, dropped words at segment boundaries, homophones). Before judging, silently reconstruct what the speaker most likely said. Do NOT report a correction for anything that is more likely a transcription error than a learner error. For every correction set "confidence": use "high" only when the error is unmistakably the learner's (for example a tense or article pattern that repeats across the transcript), and "low" when it could plausibly be a mis-transcription.

Rules:
- At most 8 corrections. Prioritise patterns that repeat over one-off slips.
- Quote "before" verbatim from the transcript so the learner can find it.
- "good_expressions" (2-4) must be things the learner actually said.
- "used_vocab": which of their due vocabulary words they actually used.
- Scores are 0-100 integers.
- Be encouraging. This person spoke English alone for ${Math.round(spokenSeconds / 60)} minutes, which is hard.
- Write summary_jp, why_jp, explanation_jp and next_time_focus_jp in ${t('feedback-lang')}.

TRANSCRIPT:
${transcript}`;
}

function soloReportsToday() {
  return Number(LS.get('soloReports:' + todayISO()) || 0);
}

async function soloFinishSession() {
  if (!soloSession.active) return;
  const spokenSeconds = Math.round(soloElapsedMs() / 1000);
  const transcript = soloSession.mic ? soloSession.mic.transcript() : '';
  const wordCount = soloCountWords(transcript);
  const inputMethod = soloSession.mic ? soloSession.mic.inputMethod() : 'speech';
  const promptsUsed = soloSession.promptsUsed.slice();
  const minutes = soloSession.minutes;

  soloTeardown();

  // 短すぎるセッションはAIを呼ばない（無料枠の無駄・レポートも薄くなる）
  if (spokenSeconds < SOLO_MIN_SECONDS || wordCount < SOLO_MIN_WORDS) {
    LS.set(SOLO_DRAFT_KEY, '');
    soloSetView('solo-report-view');
    document.getElementById('solo-report-body').innerHTML =
      `<div class="solo-too-short">
         <div class="empty-icon">🌱</div>
         <p>${escapeHtml(t('solo-too-short'))}</p>
       </div>`;
    if (typeof mascotSetMood === 'function') mascotSetMood('solo-mascot', 'idle');
    return;
  }

  if (soloReportsToday() >= SOLO_REPORTS_PER_DAY) {
    showToast(t('solo-report-limit'), 'warn');
  }

  soloSetView('solo-processing-view');
  if (typeof mascotSetMood === 'function') mascotSetMood('solo-processing-mascot', 'excited');

  const stages = ['solo-processing-1', 'solo-processing-2', 'solo-processing-3'];
  let stage = 0;
  const textEl = document.getElementById('solo-processing-text');
  const barEl = document.getElementById('solo-processing-bar');
  textEl.textContent = t(stages[0]);
  barEl.style.width = '15%';
  const stageTimer = setInterval(() => {
    stage = Math.min(stages.length - 1, stage + 1);
    textEl.textContent = t(stages[stage]);
    barEl.style.width = (15 + stage * 30) + '%';
  }, 6000);

  const session = {
    date: todayISO(), mode: 'solo', topic_pack: soloSession.pack,
    planned_minutes: minutes, spoken_seconds: spokenSeconds, word_count: wordCount,
    input_method: inputMethod, prompts_used: promptsUsed,
    transcript: soloTruncateTranscript(transcript),
    user_id: currentUserId,
  };

  let report = null;
  try {
    if (soloReportsToday() < SOLO_REPORTS_PER_DAY) {
      const due = (typeof allVocab !== 'undefined' && allVocab)
        ? allVocab.filter(v => new Date(v.next_review_at || 0).getTime() <= Date.now()).slice(0, 10).map(v => v.en)
        : [];
      const raw = await callGemini(
        buildSoloReportPrompt({
          transcript: session.transcript, minutes, spokenSeconds, wordCount,
          prompts: promptsUsed, dueWords: due,
          skillFocus: currentProfile?.skill_focus || [],
        }),
        SOLO_REPORT_SCHEMA,
        45000,                       // 既定の20秒では長いJSONに足りない
        { maxOutputTokens: 3072 }
      );
      report = JSON.parse(raw);
      LS.set('soloReports:' + todayISO(), String(soloReportsToday() + 1));
    }
  } catch (e) {
    // レポートが作れなくても文字起こしは絶対に失わない
    showToast(t('solo-report-failed') + e.message, 'error');
  } finally {
    clearInterval(stageTimer);
    barEl.style.width = '100%';
  }

  session.report = report;
  session.report_status = report ? 'ready' : 'failed';

  const { error } = await sb.from('solo_sessions').insert(session);
  if (error) showToast(t('solo-save-failed') + error.message, 'error');
  else LS.set(SOLO_DRAFT_KEY, '');

  renderSoloReport(session);
  soloSetView('solo-report-view');
  if (typeof burstConfetti === 'function') burstConfetti();

  // XP・バッジ・カレンダーに反映させる。computeXp は毎回ゼロから計算し直すので、
  // soloMeta を読み直せば過去のセッションも含めて正しい値になる。
  if (typeof loadSoloMeta === 'function') {
    const before = computeProgressStats();
    await loadSoloMeta();
    const after = computeProgressStats();
    refreshProgressUI();
    const gained = after.xp - before.xp;
    if (gained > 0 && typeof floatXpText === 'function') floatXpText(`+${gained} XP`);
    const newBadge = after.badges.find(b => b.done && !before.badges.find(p => p.id === b.id && p.done));
    if (newBadge) showToast(t('toast-badge-earned').replace('{badge}', t('badge-' + newBadge.id)), 'success');
  }
}

// 中断していたセッションから、あとでレポートだけ作る
function soloResumeDraft() {
  const draft = soloReadDraft();
  if (!draft) return;
  soloSession.active = true;
  soloSession.minutes = draft.plannedMinutes || 5;
  soloSession.pack = draft.pack || 'mixed';
  soloSession.promptsUsed = draft.promptsUsed || [];
  soloSession.startedAt = Date.now() - (draft.spokenSeconds || 0) * 1000;
  soloSession.pausedTotal = 0;
  soloSession.pausedAt = 0;
  soloSession.mic = createSoloMic({});
  soloSession.mic.restore(draft.segments || []);
  soloFinishSession();
}

// ── レポートの描画 ────────────────────────────────────────────────────────
const clampScore = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function renderSoloReport(session) {
  const body = document.getElementById('solo-report-body');
  if (!body) return;
  const r = session.report;

  const header = `
    <div class="solo-report-hero">
      <div id="solo-report-mascot" class="mascot-hero"></div>
      <div class="solo-report-headline">${escapeHtml(
        t('solo-report-headline').replace('{min}', Math.round(session.spoken_seconds / 60)))}</div>
      <div class="solo-counters">
        <span class="stat-chip"><span data-i18n="solo-count-words">語数</span> <strong>${session.word_count}</strong></span>
        <span class="stat-chip">wpm <strong>${soloWpm(session.word_count, session.spoken_seconds * 1000)}</strong></span>
      </div>
    </div>`;

  if (!r) {
    body.innerHTML = header + `
      <div class="solo-notice solo-notice-warn">${escapeHtml(t('solo-report-missing'))}</div>
      ${soloTranscriptAccordion(session.transcript)}`;
    return;
  }

  const meters = [
    ['solo-score-fluency',  clampScore(r.stats?.fluency_score)],
    ['solo-score-variety',  clampScore(r.stats?.variety_score)],
    ['solo-score-accuracy', clampScore(r.stats?.accuracy_score)],
  ].map(([key, v]) => `
    <div class="solo-meter">
      <div class="solo-meter-row"><span>${escapeHtml(t(key))}</span><strong>${v}</strong></div>
      <div class="progress-track"><div class="progress-fill" style="width:${v}%"></div></div>
    </div>`).join('');

  // 音声認識の聞き間違いを学習者の誤りとして出さないための但し書き。
  // これが無いと、身に覚えのない指摘で信頼を失う。
  const disclaimer = `<div class="solo-disclaimer">${escapeHtml(t('solo-asr-disclaimer'))}</div>`;

  const good = (r.good_expressions || []).slice(0, 5);
  const goodBlock = good.length ? `
    <div class="solo-block">
      <div class="stat-card-label">${escapeHtml(t('solo-good-title'))}</div>
      ${good.map(g => `
        <div class="solo-good-item">
          <div class="solo-good-text">${escapeHtml(g.text)}</div>
          <div class="solo-good-why">${escapeHtml(g.why_jp || '')}</div>
        </div>`).join('')}
    </div>` : '';

  // confidence が low のものは「聞き間違いかも」として折りたたむ
  const all = (r.corrections || []).slice(0, 8);
  const sure = all.filter(c => c.confidence !== 'low');
  const maybe = all.filter(c => c.confidence === 'low');
  const corrItem = c => `
    <div class="correction-item cat-${escapeHtml(c.category || 'other')}">
      <span class="corr-before">${escapeHtml(c.before)}</span>
      <span class="corr-arrow">→</span>
      <span class="corr-after">${escapeHtml(c.after)}</span>
      <div class="corr-why">${escapeHtml(c.explanation_jp || '')}</div>
    </div>`;
  const corrBlock = all.length ? `
    <div class="solo-block">
      <div class="stat-card-label">${escapeHtml(t('solo-fix-title'))}</div>
      ${sure.map(corrItem).join('')}
      ${maybe.length ? `
        <details class="solo-maybe">
          <summary>${escapeHtml(t('solo-maybe-misheard').replace('{n}', maybe.length))}</summary>
          ${maybe.map(corrItem).join('')}
        </details>` : ''}
    </div>` : '';

  const ups = (r.upgrade_suggestions || []).slice(0, 5);
  const upBlock = ups.length ? `
    <div class="solo-block">
      <div class="stat-card-label">${escapeHtml(t('solo-upgrade-title'))}</div>
      ${ups.map(u => `
        <div class="solo-upgrade-item">
          <div class="solo-upgrade-said">${escapeHtml(u.you_said)}</div>
          <div class="solo-upgrade-native">${escapeHtml(u.native_way)}</div>
        </div>`).join('')}
    </div>` : '';

  const vocab = (r.suggested_vocab || []).slice(0, 8);
  _soloSuggestedVocab = vocab;
  const vocabBlock = vocab.length ? `
    <div class="solo-block">
      <div class="stat-card-label">${escapeHtml(t('solo-vocab-title'))}</div>
      <div class="solo-vocab-chips">
        ${vocab.map(v => `<span class="solo-vocab-chip">${escapeHtml(v.en)}<small>${escapeHtml(v.jp)}</small></span>`).join('')}
      </div>
      <button class="btn btn-sm btn-primary" id="solo-add-vocab-btn" onclick="soloAddSuggestedVocab()">${escapeHtml(t('solo-vocab-add'))}</button>
    </div>` : '';

  const usedVocab = (r.stats?.used_vocab || []).filter(Boolean);
  const usedBlock = usedVocab.length ? `
    <div class="solo-notice">${escapeHtml(t('solo-used-vocab').replace('{words}', usedVocab.join(', ')))}</div>` : '';

  body.innerHTML = header
    + `<p class="solo-summary">${escapeHtml(r.summary_jp || '')}</p>`
    + meters + disclaimer + usedBlock + goodBlock + corrBlock + upBlock + vocabBlock
    + `<div class="solo-block"><div class="stat-card-label">${escapeHtml(t('solo-next-title'))}</div>
         <p class="solo-next">${escapeHtml(r.next_time_focus_jp || '')}</p></div>`
    + soloTranscriptAccordion(session.transcript);

  if (typeof mascotSetMood === 'function') mascotSetMood('solo-report-mascot', 'delighted');
}

function soloTranscriptAccordion(transcript) {
  return `
    <details class="solo-transcript-full">
      <summary>${escapeHtml(t('solo-show-transcript'))}</summary>
      <p class="solo-transcript-text">${escapeHtml(transcript || '')}</p>
    </details>`;
}

let _soloSuggestedVocab = [];

async function soloAddSuggestedVocab() {
  const btn = document.getElementById('solo-add-vocab-btn');
  if (btn) btn.disabled = true;
  // 日記の保存と同じ経路。srs_stage 0 で入るので、今日うまく言えなかった語が
  // 明日のテストに出る。
  const added = await addVocabBatch(_soloSuggestedVocab);
  if (added.length) {
    showToast(t('solo-vocab-added').replace('{n}', added.length), 'success');
    await renderVocab();
  } else {
    showToast(t('solo-vocab-none-added'), 'info');
  }
}

function soloCloseReport() {
  soloSetView('solo-setup-view');
  renderSoloSetup();
  switchTab('home');
}

// ── 過去のセッションを履歴から開く ────────────────────────────────────────
// 一覧（soloMeta）は軽量データしか持っていないので、開くときだけ
// transcript と report を含む1行をフルで取りに行く。
async function openSoloSession(id) {
  const { data, error } = await sb.from('solo_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) { showToast(t('solo-load-failed'), 'error'); return; }

  switchTab('solo');
  renderSoloReport(data);
  soloSetView('solo-report-view');
}
