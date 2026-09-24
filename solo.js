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
