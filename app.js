'use strict';

// ── Config ────────────────────────────────────────────────────────────────
const LS = { get: k => localStorage.getItem(k), set: (k,v) => localStorage.setItem(k,v) };
const WORKER_URL = 'https://english-diary-gemini-proxy.taku-yoshio0224.workers.dev';
const SUPABASE_URL = 'https://swbbslowwklhptqsaixn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3YmJzbG93d2tsaHB0cXNhaXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTcwNjcsImV4cCI6MjA5Nzc5MzA2N30.T_7VD3emSP6DbwCpYkhIjO6yRmueuNeXUkldpaGGp3c';
let currentUserId = null;
let currentUserEmail = '';

// ── i18n ──────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  ja: {
    'setup-title': '英語日記', 'setup-sub': 'ログインしてください',
    'label-email': 'メールアドレス', 'label-password': 'パスワード',
    'btn-start': 'ログイン →',
    'hint-keys': '招待されたメールアドレスでログインできます',
    'btn-logout': 'ログアウト', 'settings-account-label': 'ログイン中のアカウント',
    'app-title': '英語日記', 'nav-diary': '日記', 'nav-entries': '履歴', 'nav-vocab': '単語帳', 'nav-quiz': 'テスト',
    'step1-title': '日本語で今日の出来事を書く',
    'step2-title': '自分で英訳してみる（1回目）',
    'step3-title': 'わからない単語を控えておく',
    'step3-hint': '英訳できなかった・自信がない単語をメモしておこう',
    'step4-title': '調べた上で再英訳（2回目）',
    'step5-title': 'AIが添削', 'step6-title': '音声入力で発音チェック',
    'ph-diary-jp': '今日は...', 'ph-word-jp': '日本語の単語', 'ph-word-en': '英語（後で調べる）',
    'ph-word-note': 'メモ・解説（任意）', 'ph-word-note-add': 'これ英語で何て言うんだろう…をメモ',
    'btn-word-note-add': '＋ メモ',
    'btn-next': '次へ →', 'btn-step4-next': '調べたら次へ →',
    'btn-ai': 'AIに添削してもらう →', 'btn-shadow': 'シャドーイングできたら次へ →',
    'btn-save-diary': '💾 日記を保存', 'btn-add-word': '＋ 追加',
    'btn-tts': '🔊 音声を再生', 'tts-hint': '再生したらシャドーイングしてみよう',
    'btn-hear-target': '🔊 もう一度聞く',
    'ai-corrected-label': '✨ 添削後の英文', 'ai-feedback-label': '📝 フィードバック',
    'target-label': '目標文', 'mic-label': 'タップして話す',
    'speech-recognized': '認識された文', 'entries-title': '過去の日記',
    'ph-entries-search': '日記を検索…', 'btn-prev': '前へ', 'btn-next-page': '次へ',
    'entries-empty': 'まだ日記がありません', 'entries-no-results': '検索結果がありません',
    'ph-v-jp': '日本語', 'ph-v-note': 'メモ（任意）', 'btn-vocab-add': '追加',
    'vocab-empty-text': '単語帳が空です<br>日記を書いて追加しよう',
    'quiz-empty': '単語帳に単語を追加してからテストしよう',
    'stat-ok': '正解', 'stat-ng': '不正解', 'stat-left': '残り',
    'btn-hint': 'ヒントを見る', 'btn-hint-hide': 'ヒントを隠す',
    'ph-quiz': '答えを入力…', 'btn-check': '確認', 'btn-skip': 'スキップ',
    'btn-restart': '🔄 最初から', 'settings-title': '設定',
    'btn-cancel': 'キャンセル', 'btn-settings-save': '保存',
    'modal-jp-label': '🇯🇵 日本語', 'modal-en1-label': '✍️ 自分の英訳（1回目）',
    'modal-en2-label': '✍️ 自分の英訳（2回目）', 'modal-corrected-label': '✨ AI添削後',
    'modal-hear': '🔊 もう一度聞く', 'modal-pronounce-label': '🎤 発音チェック',
    // Dynamic
    'alert-write-jp': '日本語で今日の出来事を書いてね',
    'alert-write-en2': '2回目の英訳を書いてね',
    'alert-write-before-save': '日記を書いてから保存してね',
    'alert-vocab-fill': '英語と日本語を入力してね',
    'alert-no-speech': 'このブラウザは音声認識に対応していません。ChromeかSafariをお使いください。',
    'alert-auth-error': 'ログインが必要です。ログインし直してください。',
    'alert-login-fill': 'メールアドレスとパスワードを入力してね',
    'loading-correcting': 'AIが添削中…', 'loading-feedback': 'フィードバック生成中…',
    'error-ai': 'AI添削エラー: ', 'error-save': '保存エラー: ', 'error-vocab': 'エラー: ',
    'toast-saved': '日記を保存しました！', 'toast-words-added': '件の単語を単語帳に追加。',
    'toast-word-note-added': 'メモを追加しました',
    'vocab-untested': '未テスト',
    'ph-vocab-search': '単語を検索…', 'vocab-no-results': '検索結果がありません',
    'quiz-complete': '🎉 完了！', 'quiz-rate': '正解率 ',
    'quiz-correct': '✓ 正解！「', 'quiz-wrong': '✗ 不正解。正解は「',
    'quiz-dir-en2jp': '英語 → 日本語', 'quiz-dir-jp2en': '日本語 → 英語',
    'mic-listening': '認識中…', 'btn-tts-playing': '🔊 再生中…', 'btn-tts-replay': '🔊 もう一度再生',
    'score-great': '🎉 すごい！ {score}% 一致 — ネイティブに近い発音です',
    'score-ok': '👍 {score}% 一致 — もう一度練習してみよう',
    'score-try': '💪 {score}% 一致 — ゆっくり音声を聞いてから再挑戦！',
    'feedback-lang': '日本語',
    'ai-corrections-label': '🔍 修正ポイント',
    'fb-good': '👍 良かった点', 'fb-improve': '📈 改善点', 'fb-vocab': '📚 調べた単語の使い方',
    'type-grammar': '文法', 'type-vocabulary': '語彙', 'type-naturalness': '自然さ', 'type-spelling': 'スペル',
    'quiz-typo-note': '（スペルに注意！）',
    'word-feedback-hint': '赤い単語が認識されませんでした。もう一度挑戦！',
  },
  en: {
    'setup-title': 'English Diary', 'setup-sub': 'Please log in',
    'label-email': 'Email', 'label-password': 'Password',
    'btn-start': 'Log in →',
    'hint-keys': 'Log in with the email address you were invited with',
    'btn-logout': 'Log out', 'settings-account-label': 'Logged in as',
    'app-title': 'English Diary', 'nav-diary': 'Diary', 'nav-entries': 'History', 'nav-vocab': 'Vocabulary', 'nav-quiz': 'Quiz',
    'step1-title': 'Write today\'s diary in your native language',
    'step2-title': 'Try translating it into English (1st attempt)',
    'step3-title': 'Note down words you didn\'t know',
    'step3-hint': 'Write down words you couldn\'t translate or weren\'t sure about',
    'step4-title': 'Look them up and re-translate (2nd attempt)',
    'step5-title': 'AI Correction', 'step6-title': 'Pronunciation Check',
    'ph-diary-jp': 'Write in your native language...', 'ph-word-jp': 'Word in your language', 'ph-word-en': 'English (look it up)',
    'ph-word-note': 'Note / explanation (optional)', 'ph-word-note-add': 'Note down a word you don\'t know in English…',
    'btn-word-note-add': '+ Note',
    'btn-next': 'Next →', 'btn-step4-next': 'Next after looking up →',
    'btn-ai': 'Get AI Correction →', 'btn-shadow': 'Next after shadowing →',
    'btn-save-diary': '💾 Save Diary', 'btn-add-word': '+ Add',
    'btn-tts': '🔊 Play Audio', 'tts-hint': 'Try shadowing after listening',
    'btn-hear-target': '🔊 Listen again',
    'ai-corrected-label': '✨ Corrected English', 'ai-feedback-label': '📝 Feedback',
    'target-label': 'Target sentence', 'mic-label': 'Tap to speak',
    'speech-recognized': 'Recognized speech', 'entries-title': 'Past Entries',
    'ph-entries-search': 'Search diary entries…', 'btn-prev': 'Prev', 'btn-next-page': 'Next',
    'entries-empty': 'No diary entries yet', 'entries-no-results': 'No matching entries',
    'ph-v-jp': 'Translation', 'ph-v-note': 'Note (optional)', 'btn-vocab-add': 'Add',
    'vocab-empty-text': 'Your vocabulary is empty<br>Write a diary to add words',
    'quiz-empty': 'Add words to your vocabulary first',
    'stat-ok': 'Correct', 'stat-ng': 'Wrong', 'stat-left': 'Left',
    'btn-hint': 'Show hint', 'btn-hint-hide': 'Hide hint',
    'ph-quiz': 'Type your answer…', 'btn-check': 'Check', 'btn-skip': 'Skip',
    'btn-restart': '🔄 Restart', 'settings-title': 'Settings',
    'btn-cancel': 'Cancel', 'btn-settings-save': 'Save',
    'modal-jp-label': '🌏 Original', 'modal-en1-label': '✍️ My Translation (1st)',
    'modal-en2-label': '✍️ My Translation (2nd)', 'modal-corrected-label': '✨ AI Corrected',
    'modal-hear': '🔊 Listen again', 'modal-pronounce-label': '🎤 Pronunciation Check',
    // Dynamic
    'alert-write-jp': 'Please write today\'s diary entry first',
    'alert-write-en2': 'Please write your 2nd translation first',
    'alert-write-before-save': 'Please write your diary before saving',
    'alert-vocab-fill': 'Please fill in both English and translation',
    'alert-no-speech': 'Speech recognition is not supported. Please use Chrome or Safari.',
    'alert-auth-error': 'You need to be logged in. Please log in again.',
    'alert-login-fill': 'Please enter your email and password',
    'loading-correcting': 'AI is correcting…', 'loading-feedback': 'Generating feedback…',
    'error-ai': 'AI correction error: ', 'error-save': 'Save error: ', 'error-vocab': 'Error: ',
    'toast-saved': 'Diary saved!', 'toast-words-added': ' words added to vocabulary.',
    'toast-word-note-added': 'Note added',
    'vocab-untested': 'New',
    'ph-vocab-search': 'Search vocabulary…', 'vocab-no-results': 'No matching words',
    'quiz-complete': '🎉 Done!', 'quiz-rate': 'Score: ',
    'quiz-correct': '✓ Correct! "', 'quiz-wrong': '✗ Wrong. Answer: "',
    'quiz-dir-en2jp': 'English → Translation', 'quiz-dir-jp2en': 'Translation → English',
    'mic-listening': 'Listening…', 'btn-tts-playing': '🔊 Playing…', 'btn-tts-replay': '🔊 Play again',
    'score-great': '🎉 Excellent! {score}% match — Near-native pronunciation!',
    'score-ok': '👍 {score}% match — Keep practicing!',
    'score-try': '💪 {score}% match — Listen again and try once more!',
    'feedback-lang': 'English',
    'ai-corrections-label': '🔍 Corrections',
    'fb-good': '👍 What you did well', 'fb-improve': '📈 Improvements', 'fb-vocab': '📚 Vocabulary usage',
    'type-grammar': 'Grammar', 'type-vocabulary': 'Vocabulary', 'type-naturalness': 'Naturalness', 'type-spelling': 'Spelling',
    'quiz-typo-note': ' (watch the spelling!)',
    'word-feedback-hint': 'Red words were not recognized. Try again!',
  }
};

// ── Utils ─────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Damerau-Levenshtein（隣接文字の入れ替えも距離1と数える）
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
    }
    prev2 = prev; prev = cur;
  }
  return prev[n];
}

function getLang() { return LS.get('lang') || 'ja'; }
function t(key) { return (TRANSLATIONS[getLang()] || TRANSLATIONS.ja)[key] || TRANSLATIONS.ja[key] || key; }

function applyLang() {
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.textContent = lang === 'ja' ? 'EN' : 'JA';
  document.documentElement.lang = lang === 'ja' ? 'ja' : 'en';
}

function toggleLang() {
  LS.set('lang', getLang() === 'ja' ? 'en' : 'ja');
  applyLang();
}

// ── Supabase ──────────────────────────────────────────────────────────────
let sb = null;
function initSB() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ── Boot / Auth ───────────────────────────────────────────────────────────
async function enterApp(session) {
  currentUserId = session.user.id;
  currentUserEmail = session.user.email || '';
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  setDateLabel();
  addWordRow();
  await Promise.all([loadEntries(), renderVocab()]);
  startQuiz();
}

function showLogin() {
  currentUserId = null;
  currentUserEmail = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'flex';
}

window.addEventListener('DOMContentLoaded', async () => {
  applyLang();
  initSB();
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await enterApp(session); } else { showLogin(); }
});

// ── Login / Logout ───────────────────────────────────────────────────────
async function loginUser() {
  const email    = document.getElementById('s-email').value.trim();
  const password = document.getElementById('s-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = t('alert-login-fill'); return; }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; return; }
  await enterApp(data.session);
}
function openSettings() {
  document.getElementById('settings-email').textContent = currentUserEmail;
  document.getElementById('settings-modal').style.display = 'flex';
}
async function logoutUser() {
  await sb.auth.signOut();
  closeModal('settings-modal');
  showLogin();
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  if (name === 'entries') loadEntries();
  if (name === 'vocab')   renderVocab();
  if (name === 'quiz')    startQuiz();
}

// ── Modal ─────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ── Date ──────────────────────────────────────────────────────────────────
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDate();
  const sfx = [,'st','nd','rd'][day%10 > 3 ? 0 : day%10] || 'th';
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${day}${sfx} ${d.getFullYear()}`;
}
function setDateLabel() {
  document.getElementById('today-label').textContent = fmtDate(new Date().toISOString().split('T')[0]);
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

// ── Step unlocking ────────────────────────────────────────────────────────
function unlock(cardId) {
  const el = document.getElementById(cardId);
  el.classList.remove('locked');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function lock(cardId) { document.getElementById(cardId).classList.add('locked'); }

// ── STEP 1 → 2 ───────────────────────────────────────────────────────────
function goStep2() {
  const jp = document.getElementById('diary-jp').value.trim();
  if (!jp) { alert(t('alert-write-jp')); return; }
  document.getElementById('jp-ref-2').textContent = jp;
  unlock('step2-card');
}

// ── STEP 2 → 3 ───────────────────────────────────────────────────────────
function goStep3() {
  unlock('step3-card');
}

// ── STEP 3 word rows ──────────────────────────────────────────────────────
function addWordRow(jp = '') {
  const row = document.createElement('div');
  row.className = 'word-row';
  row.innerHTML = `
    <div class="word-row-main">
      <input type="text" class="input word-jp" placeholder="${t('ph-word-jp')}" value="${escapeHtml(jp)}" />
      <span class="arrow">→</span>
      <input type="text" class="input word-en" placeholder="${t('ph-word-en')}" />
      <button class="icon-btn red" onclick="removeWordRow(this)">✕</button>
    </div>
    <textarea class="input word-note" placeholder="${t('ph-word-note')}"></textarea>
  `;
  document.getElementById('unknown-words-list').appendChild(row);
}
function addWordNote() {
  const input = document.getElementById('s2-word-note');
  const jp = input.value.trim();
  if (!jp) return;
  addWordRow(jp);
  input.value = '';
  showToast(t('toast-word-note-added'));
}
function removeWordRow(btn) {
  const rows = document.querySelectorAll('.word-row');
  if (rows.length > 1) btn.closest('.word-row').remove();
}

// ── STEP 3 → 4 ───────────────────────────────────────────────────────────
function goStep4() {
  const jp = document.getElementById('diary-jp').value.trim();
  document.getElementById('jp-ref-4').textContent = jp;

  const hints = document.getElementById('word-hints');
  hints.innerHTML = '';
  document.querySelectorAll('.word-row').forEach(row => {
    const wordJp = row.querySelector('.word-jp').value.trim();
    const wordEn = row.querySelector('.word-en').value.trim();
    if (wordJp || wordEn) {
      const chip = document.createElement('span');
      chip.className = 'word-hint-item';
      chip.textContent = wordJp + (wordEn ? ` → ${wordEn}` : ' → ?');
      hints.appendChild(chip);
    }
  });

  unlock('step4-card');
}

// ── STEP 4 → 5 (Gemini) ──────────────────────────────────────────────────
const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    corrected:    { type: 'string' },
    good_points:  { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    corrections:  { type: 'array', items: {
      type: 'object',
      properties: {
        before:      { type: 'string' },
        after:       { type: 'string' },
        type:        { type: 'string', enum: ['grammar', 'vocabulary', 'naturalness', 'spelling'] },
        explanation: { type: 'string' },
        jp:          { type: 'string' },
      },
      required: ['before', 'after', 'type', 'explanation'],
    } },
    vocab_usage: { type: 'string' },
  },
  required: ['corrected', 'good_points', 'improvements', 'corrections'],
};

function startAiProgress() {
  const track = document.getElementById('ai-progress-track');
  const bar   = document.getElementById('ai-progress-bar');
  track.style.display = 'block';
  bar.style.width = '0%';
  let pct = 0;
  const timer = setInterval(() => {
    pct = Math.min(90, pct + Math.random() * 10);
    bar.style.width = pct + '%';
  }, 400);
  return () => {
    clearInterval(timer);
    bar.style.width = '100%';
    setTimeout(() => { track.style.display = 'none'; }, 300);
  };
}

async function goStep5() {
  const en2 = document.getElementById('diary-en2').value.trim();
  if (!en2) { alert(t('alert-write-en2')); return; }

  unlock('step5-card');
  const correctedEl = document.getElementById('ai-corrected-text');
  const feedbackEl  = document.getElementById('ai-feedback-text');
  correctedEl.innerHTML = `<span class="loading-text">${t('loading-correcting')}</span>`;
  feedbackEl.innerHTML  = `<span class="loading-text">${t('loading-feedback')}</span>`;
  renderCorrections([]);
  const stopProgress = startAiProgress();

  const jp  = document.getElementById('diary-jp').value.trim();
  const en1 = document.getElementById('diary-en1').value.trim();

  const words = [];
  document.querySelectorAll('.word-row').forEach(row => {
    const wj = row.querySelector('.word-jp').value.trim();
    const we = row.querySelector('.word-en').value.trim();
    if (wj && we) words.push(`${wj} → ${we}`);
  });

  const feedbackLang = t('feedback-lang');
  const prompt = `You are an experienced native English teacher helping a language learner improve through diary writing.

Original diary entry (learner's native language): "${jp}"

Student's 1st English attempt: "${en1 || '(none)'}"
Vocabulary the student looked up: ${words.length ? words.join(', ') : '(none)'}
Student's 2nd English attempt (after looking up words): "${en2}"

Fill in the JSON fields as follows:
- "corrected": Rewrite the 2nd attempt as the most natural native English version. Keep the same meaning and personal tone, and keep the student's wording wherever it is already correct. Do not add information that is not in the diary.
- "good_points": exactly 2 specific things the student did well.
- "improvements": 1-2 specific improvements from the 1st to the 2nd attempt (if there was no 1st attempt, suggest what to focus on next).
- "corrections": the 3-6 most important fixes you made. For each: "before" is the student's phrase, "after" is your fix, "type" is one of grammar / vocabulary / naturalness / spelling, "explanation" is one short sentence on why, and if "type" is "vocabulary" also fill "jp" with a short Japanese translation of the corrected word/phrase in "after" (leave "jp" empty for other types).
- "vocab_usage": if the student looked up vocabulary, one short comment on whether they used those words correctly; otherwise an empty string.

Be encouraging and specific. Write "good_points", "improvements", every "explanation", and "vocab_usage" in ${feedbackLang}.`;

  try {
    const res  = await callGemini(prompt, CORRECTION_SCHEMA);
    const data = JSON.parse(res);
    if (!data.corrected) throw new Error('empty response');
    correctedEl.textContent = data.corrected;
    renderFeedback(data);
    renderCorrections(data.corrections);
    window._correctedText = data.corrected;
    window._lastCorrections = data.corrections || [];
  } catch (e) {
    correctedEl.textContent = en2 + '\n\n(' + t('error-ai') + e.message + ')';
    feedbackEl.textContent  = '';
    renderCorrections([]);
    window._correctedText   = en2;
    window._lastCorrections = [];
  } finally {
    stopProgress();
  }
}

function renderFeedback(data) {
  const el = document.getElementById('ai-feedback-text');
  const section = (label, items) => items && items.length
    ? `<div class="fb-section"><div class="fb-head">${t(label)}</div><ul class="fb-list">${items.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
    : '';
  let html = section('fb-good', data.good_points) + section('fb-improve', data.improvements);
  if (data.vocab_usage) {
    html += `<div class="fb-section"><div class="fb-head">${t('fb-vocab')}</div><p>${escapeHtml(data.vocab_usage)}</p></div>`;
  }
  el.innerHTML = html;
}

function renderCorrections(list) {
  const box = document.getElementById('ai-corrections-box');
  const el  = document.getElementById('ai-corrections-list');
  if (!list || !list.length) { box.style.display = 'none'; el.innerHTML = ''; return; }
  box.style.display = 'block';
  el.innerHTML = list.map(c => `
    <div class="correction-item">
      <div class="correction-diff">
        <span class="corr-before">${escapeHtml(c.before)}</span>
        <span class="corr-arrow">→</span>
        <span class="corr-after">${escapeHtml(c.after)}</span>
        <span class="corr-tag corr-tag-${escapeHtml(c.type)}">${escapeHtml(t('type-' + c.type))}</span>
      </div>
      <div class="correction-exp">${escapeHtml(c.explanation)}</div>
    </div>`).join('');
}

// ── TTS (ブラウザ内蔵 Web Speech API) ────────────────────────────────────
function speakText(text) {
  const btn = document.getElementById('tts-btn');
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 0.9;
  const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  if (voices.length) utter.voice = voices[0];
  utter.onend = () => {
    if (btn) { btn.textContent = t('btn-tts-replay'); btn.disabled = false; }
  };
  if (btn) { btn.textContent = t('btn-tts-playing'); btn.disabled = false; }
  speechSynthesis.speak(utter);
}

function speakCorrected() {
  const text = document.getElementById('ai-corrected-text').textContent;
  if (!text || text.includes('添削中') || text.includes('correcting')) return;
  speakText(text);
}

function speakTarget() {
  const text = document.getElementById('target-sentence').textContent;
  if (text) speakText(text);
}

let _modalCorrectedText = '';
function speakModalText() { if (_modalCorrectedText) speakText(_modalCorrectedText); }

// ── STEP 5 → 6 ───────────────────────────────────────────────────────────
function goStep6() {
  const corrected = window._correctedText || document.getElementById('ai-corrected-text').textContent;
  document.getElementById('target-sentence').textContent = corrected;
  unlock('step6-card');
  setTimeout(() => speakText(corrected), 400);
}

// ── Web Speech API (Step 6 / 過去日記モーダル共通) ────────────────────────
const STEP6_CTX = { target: 'target-sentence', micBtn: 'mic-btn', result: 'speech-result', text: 'speech-text', score: 'speech-score', feedback: 'word-feedback' };
const MODAL_CTX  = { target: 'modal-corrected', micBtn: 'modal-mic-btn', result: 'modal-speech-result', text: 'modal-speech-text', score: 'modal-speech-score', feedback: 'modal-word-feedback' };

let recognition = null;
let isRecording = false;

function toggleMic(ctx = STEP6_CTX) {
  if (isRecording) { stopMic(ctx); return; }
  startMic(ctx);
}

function startMic(ctx = STEP6_CTX) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert(t('alert-no-speech')); return; }

  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  const btn = document.getElementById(ctx.micBtn);
  btn.classList.add('recording');
  btn.querySelector('.mic-label').textContent = t('mic-listening');
  isRecording = true;

  document.getElementById(ctx.result).style.display = 'none';

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
    document.getElementById(ctx.text).textContent = transcript;
    document.getElementById(ctx.result).style.display = 'block';
    const last = e.results[e.results.length - 1];
    if (last.isFinal) {
      const prefix = Array.from(e.results).slice(0, -1).map(r => r[0].transcript).join(' ');
      const alternatives = Array.from(last).map(a => (prefix + ' ' + a.transcript).trim());
      scorePronunciation(alternatives, ctx);
    }
  };

  recognition.onerror = (e) => {
    stopMic(ctx);
    if (e.error !== 'no-speech') alert('Error: ' + e.error);
  };

  recognition.onend = () => stopMic(ctx);
  recognition.start();
}

function stopMic(ctx = STEP6_CTX) {
  if (recognition) { recognition.stop(); recognition = null; }
  isRecording = false;
  const btn = document.getElementById(ctx.micBtn);
  btn.classList.remove('recording');
  btn.querySelector('.mic-label').textContent = t('mic-label');
}

const CONTRACTIONS = {
  "i'm":"i am","you're":"you are","he's":"he is","she's":"she is","it's":"it is",
  "we're":"we are","they're":"they are","that's":"that is","there's":"there is",
  "what's":"what is","let's":"let us","i've":"i have","you've":"you have",
  "we've":"we have","they've":"they have","i'll":"i will","you'll":"you will",
  "he'll":"he will","she'll":"she will","we'll":"we will","they'll":"they will",
  "i'd":"i would","you'd":"you would","don't":"do not","doesn't":"does not",
  "didn't":"did not","isn't":"is not","aren't":"are not","wasn't":"was not",
  "weren't":"were not","can't":"cannot","couldn't":"could not","won't":"will not",
  "wouldn't":"would not","shouldn't":"should not","haven't":"have not",
  "hasn't":"has not","hadn't":"had not","mustn't":"must not",
};

// 小文字化・アクセント記号除去・短縮形展開・記号除去して単語配列にする
function speechWords(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'").split(/\s+/)
    .map(w => {
      const bare = w.replace(/[^a-z0-9']/g, '');
      return CONTRACTIONS[bare] || bare.replace(/'/g, '');
    })
    .join(' ').split(/\s+/).filter(Boolean);
}

// LCS（最長共通部分列）で語順を考慮したアライメント。target各語の一致フラグを返す
function lcsMatchFlags(target, spoken) {
  const n = target.length, m = spoken.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = target[i] === spoken[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const flags = new Array(n).fill(false);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (target[i] === spoken[j]) { flags[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return flags;
}

function scorePronunciation(spokenAlternatives, ctx = STEP6_CTX) {
  const alts = Array.isArray(spokenAlternatives) ? spokenAlternatives : [spokenAlternatives];
  const targetText = document.getElementById(ctx.target).textContent;

  // 表示用トークンと正規化語の対応（短縮形は複数語に展開されるため）
  const tokens = targetText.trim().split(/\s+/).filter(Boolean);
  const norm = [], tokenOf = [];
  tokens.forEach((tok, ti) => speechWords(tok).forEach(w => { norm.push(w); tokenOf.push(ti); }));

  let best = { score: 0, flags: new Array(norm.length).fill(false) };
  alts.forEach(alt => {
    const flags = lcsMatchFlags(norm, speechWords(alt));
    const matched = flags.filter(Boolean).length;
    const score = norm.length ? Math.round(matched / norm.length * 100) : 0;
    if (score >= best.score) best = { score, flags };
  });
  const score = best.score;

  // 単語ごとの色分け表示（一致=緑、不一致=赤）
  const wfEl = document.getElementById(ctx.feedback);
  if (wfEl) {
    const tokenMatched = tokens.map((_, ti) => {
      const idxs = tokenOf.reduce((acc, tv, i) => (tv === ti ? (acc.push(i), acc) : acc), []);
      return idxs.length ? idxs.every(i => best.flags[i]) : true;
    });
    const anyMiss = tokenMatched.some(m => !m);
    wfEl.innerHTML = tokens.map((tok, ti) =>
      `<span class="wf-word ${tokenMatched[ti] ? 'wf-ok' : 'wf-miss'}">${escapeHtml(tok)}</span>`
    ).join(' ') + (anyMiss ? `<div class="wf-hint">${escapeHtml(t('word-feedback-hint'))}</div>` : '');
    wfEl.style.display = 'block';
  }

  const scoreEl = document.getElementById(ctx.score);
  const fmt = (key) => t(key).replace('{score}', score);
  if (score >= 80) {
    scoreEl.className = 'speech-score score-great';
    scoreEl.textContent = fmt('score-great');
  } else if (score >= 50) {
    scoreEl.className = 'speech-score score-ok';
    scoreEl.textContent = fmt('score-ok');
  } else {
    scoreEl.className = 'speech-score score-try';
    scoreEl.textContent = fmt('score-try');
  }
}

// ── Save Diary ────────────────────────────────────────────────────────────
async function saveDiary() {
  const jp        = document.getElementById('diary-jp').value.trim();
  const en1       = document.getElementById('diary-en1').value.trim();
  const en2       = document.getElementById('diary-en2').value.trim();
  const corrected = window._correctedText || '';
  if (!jp) { alert(t('alert-write-before-save')); return; }

  const newWords = [];
  document.querySelectorAll('.word-row').forEach(row => {
    const wordJp   = row.querySelector('.word-jp').value.trim();
    const wordEn   = row.querySelector('.word-en').value.trim();
    const wordNote = row.querySelector('.word-note').value.trim();
    if (wordJp && wordEn) newWords.push({ jp: wordJp, en: wordEn, note: wordNote });
  });

  (window._lastCorrections || []).forEach(c => {
    if (c.type === 'vocabulary' && c.jp && c.after) {
      newWords.push({ jp: c.jp, en: c.after, note: c.explanation || '' });
    }
  });

  const { error } = await sb.from('entries').insert({
    date: todayISO(), jp, en1, en2, corrected, user_id: currentUserId,
  });
  if (error) { alert(t('error-save') + error.message); return; }

  let toAdd = [];
  if (newWords.length) {
    const { data: existing } = await sb.from('vocab').select('en');
    const existingSet = new Set((existing||[]).map(v => v.en.toLowerCase()));
    const seenInBatch = new Set();
    toAdd = newWords.filter(w => {
      const key = w.en.toLowerCase();
      if (existingSet.has(key) || seenInBatch.has(key)) return false;
      seenInBatch.add(key);
      return true;
    });
    if (toAdd.length) {
      await sb.from('vocab').insert(toAdd.map(w => ({ ...w, correct: 0, wrong: 0, user_id: currentUserId })));
    }
  }

  document.getElementById('diary-jp').value  = '';
  document.getElementById('diary-en1').value = '';
  document.getElementById('diary-en2').value = '';
  document.getElementById('s2-word-note').value = '';
  document.getElementById('unknown-words-list').innerHTML = '';
  addWordRow();
  window._correctedText   = '';
  window._lastCorrections = [];
  ['step2-card','step3-card','step4-card','step5-card','step6-card'].forEach(id => lock(id));
  document.getElementById('speech-result').style.display = 'none';
  document.getElementById('ai-corrected-text').textContent = '';
  document.getElementById('ai-feedback-text').textContent  = '';
  renderCorrections([]);
  document.getElementById('word-feedback').innerHTML = '';
  document.getElementById('target-sentence').textContent   = '';

  await loadEntries();
  const wordsMsg = toAdd.length ? `${toAdd.length}${t('toast-words-added')}` : '';
  showToast(t('toast-saved') + (wordsMsg ? ' ' + wordsMsg : ''));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Past Entries ──────────────────────────────────────────────────────────
let entriesPage = 1, entriesPageSize = 10, entriesSearch = '';
let entriesSearchTimer = null;

function sanitizeSearchTerm(term) {
  return term.trim().replace(/[,()%]/g, '');
}

async function loadEntries() {
  const section  = document.getElementById('entries-section');
  const list     = document.getElementById('entries-list');
  const pageInfo = document.getElementById('entries-page-info');

  const term = sanitizeSearchTerm(entriesSearch);
  let query = sb.from('entries').select('*', { count: 'exact' }).order('date', { ascending: false });
  if (term) {
    query = query.or(`jp.ilike.%${term}%,en1.ilike.%${term}%,en2.ilike.%${term}%,corrected.ilike.%${term}%`);
  }
  const from = (entriesPage - 1) * entriesPageSize;
  const to   = from + entriesPageSize - 1;
  const { data, count } = await query.range(from, to);

  if (!count && !term) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const totalPages = Math.max(1, Math.ceil((count || 0) / entriesPageSize));
  if (entriesPage > totalPages) { entriesPage = totalPages; return loadEntries(); }

  if (!data || !data.length) {
    list.innerHTML = `<div class="empty-state-small">${escapeHtml(t(term ? 'entries-no-results' : 'entries-empty'))}</div>`;
  } else {
    list.innerHTML = data.map(e => `
      <div class="entry-card" onclick="viewEntry(${e.id})">
        <div class="entry-date">${fmtDate(e.date)}</div>
        <div class="entry-preview">${escapeHtml(e.jp)}</div>
      </div>
    `).join('');
  }

  pageInfo.textContent = `${entriesPage} / ${totalPages}`;
  document.getElementById('entries-prev').disabled = entriesPage <= 1;
  document.getElementById('entries-next').disabled = entriesPage >= totalPages;
}

function onEntriesSearchInput(value) {
  entriesSearch = value;
  entriesPage = 1;
  clearTimeout(entriesSearchTimer);
  entriesSearchTimer = setTimeout(loadEntries, 300);
}
function changeEntriesPageSize(size) {
  entriesPageSize = Number(size);
  entriesPage = 1;
  loadEntries();
}
function entriesPrevPage() { if (entriesPage > 1) { entriesPage--; loadEntries(); } }
function entriesNextPage() { entriesPage++; loadEntries(); }

const ENTRY_EDIT_FIELDS = ['jp', 'en1', 'en2', 'corrected'];
let _modalEntryId = null;
let _modalEntryData = null;

async function viewEntry(id) {
  const { data } = await sb.from('entries').select('*').eq('id', id).single();
  if (!data) return;
  _modalEntryId   = data.id;
  _modalEntryData = data;
  document.getElementById('modal-date').textContent      = fmtDate(data.date);
  document.getElementById('modal-jp').textContent        = data.jp || '—';
  document.getElementById('modal-en1').textContent       = data.en1 || '—';
  document.getElementById('modal-en2').textContent       = data.en2 || '—';
  document.getElementById('modal-corrected').textContent = data.corrected || '—';
  _modalCorrectedText = data.corrected || '';
  document.getElementById('modal-speech-result').style.display = 'none';
  document.getElementById('modal-speech-text').textContent = '';
  document.getElementById('modal-word-feedback').innerHTML = '';
  setEntryEditMode(false);
  document.getElementById('entry-modal').style.display = 'flex';
}

function setEntryEditMode(on) {
  ENTRY_EDIT_FIELDS.forEach(f => {
    document.getElementById('modal-' + f).style.display = on ? 'none' : 'block';
    document.getElementById('modal-' + f + '-edit').style.display = on ? 'block' : 'none';
  });
  document.getElementById('modal-edit-btn').style.display = on ? 'none' : 'inline-block';
  document.getElementById('modal-edit-actions').style.display = on ? 'block' : 'none';
}

function toggleEntryEdit() {
  ENTRY_EDIT_FIELDS.forEach(f => {
    document.getElementById('modal-' + f + '-edit').value = _modalEntryData[f] || '';
  });
  setEntryEditMode(true);
}

function cancelEntryEdit() { setEntryEditMode(false); }

async function saveEntryEdit() {
  const vals = {};
  ENTRY_EDIT_FIELDS.forEach(f => { vals[f] = document.getElementById('modal-' + f + '-edit').value.trim(); });
  const { error } = await sb.from('entries').update(vals).eq('id', _modalEntryId);
  if (error) { alert(t('error-save') + error.message); return; }
  _modalEntryData = { ..._modalEntryData, ...vals };
  ENTRY_EDIT_FIELDS.forEach(f => {
    document.getElementById('modal-' + f).textContent = vals[f] || '—';
  });
  _modalCorrectedText = vals.corrected || '';
  setEntryEditMode(false);
  await loadEntries();
}

// ── Vocab ─────────────────────────────────────────────────────────────────
async function addVocab() {
  const en   = document.getElementById('v-en').value.trim();
  const jp   = document.getElementById('v-jp').value.trim();
  const note = document.getElementById('v-note').value.trim();
  if (!en || !jp) { alert(t('alert-vocab-fill')); return; }
  const { error } = await sb.from('vocab').insert({ en, jp, note, correct: 0, wrong: 0, user_id: currentUserId });
  if (error) { alert(t('error-vocab') + error.message); return; }
  document.getElementById('v-en').value = '';
  document.getElementById('v-jp').value = '';
  document.getElementById('v-note').value = '';
  await renderVocab();
}
async function deleteVocab(id) {
  if (!confirm('Delete this word?')) return;
  await sb.from('vocab').delete().eq('id', id);
  await renderVocab();
}
let allVocab = [];
let vocabSearch = '';
let editingVocabId = null;

async function renderVocab() {
  const { data } = await sb.from('vocab').select('*').order('created_at', { ascending: false });
  allVocab = data || [];
  editingVocabId = null;
  filterAndRenderVocab();
}

function startEditVocab(id) { editingVocabId = id; filterAndRenderVocab(); }
function cancelEditVocab() { editingVocabId = null; filterAndRenderVocab(); }
async function saveEditVocab(id) {
  const en   = document.getElementById(`ve-en-${id}`).value.trim();
  const jp   = document.getElementById(`ve-jp-${id}`).value.trim();
  const note = document.getElementById(`ve-note-${id}`).value.trim();
  if (!en || !jp) { alert(t('alert-vocab-fill')); return; }
  const { error } = await sb.from('vocab').update({ en, jp, note }).eq('id', id);
  if (error) { alert(t('error-vocab') + error.message); return; }
  editingVocabId = null;
  await renderVocab();
}

function filterAndRenderVocab() {
  const list  = document.getElementById('vocab-list');
  const empty = document.getElementById('vocab-empty');
  const count = document.getElementById('vocab-count');

  const term = vocabSearch.trim().toLowerCase();
  const vocab = term
    ? allVocab.filter(v => v.en.toLowerCase().includes(term) || v.jp.toLowerCase().includes(term))
    : allVocab;

  if (!vocab.length) {
    count.textContent = '';
    if (allVocab.length && term) {
      empty.style.display = 'none';
      list.innerHTML = `<div class="empty-state-small">${escapeHtml(t('vocab-no-results'))}</div>`;
    } else {
      list.innerHTML = '';
      empty.style.display = 'block';
    }
    return;
  }
  empty.style.display = 'none';
  count.textContent   = `${vocab.length}`;
  list.innerHTML = vocab.map(v => {
    if (editingVocabId === v.id) {
      return `<div class="vocab-row vocab-row-editing">
        <input type="text" class="input" id="ve-en-${v.id}" value="${escapeHtml(v.en)}" />
        <input type="text" class="input" id="ve-jp-${v.id}" value="${escapeHtml(v.jp)}" />
        <input type="text" class="input" id="ve-note-${v.id}" value="${escapeHtml(v.note||'')}" />
        <button class="icon-btn" onclick="saveEditVocab(${v.id})" title="保存">💾</button>
        <button class="icon-btn" onclick="cancelEditVocab()" title="キャンセル">✕</button>
      </div>`;
    }
    const total = (v.correct||0) + (v.wrong||0);
    const rate  = total ? Math.round(v.correct/total*100) : null;
    const cls   = rate===null ? 'rate-new' : rate>=70 ? 'rate-ok' : 'rate-ng';
    return `<div class="vocab-row">
      <div class="v-en">${escapeHtml(v.en)}</div>
      <div class="v-jp">${escapeHtml(v.jp)}</div>
      <div class="v-note">${escapeHtml(v.note||'')}</div>
      <span class="v-rate ${cls}">${rate===null ? t('vocab-untested') : rate+'%'}</span>
      <button class="icon-btn" onclick="startEditVocab(${v.id})" title="編集">✏️</button>
      <button class="icon-btn red" onclick="deleteVocab(${v.id})" title="削除">✕</button>
    </div>`;
  }).join('');
}

function onVocabSearchInput(value) {
  vocabSearch = value;
  filterAndRenderVocab();
}

// ── Quiz ──────────────────────────────────────────────────────────────────
let queue=[], currentCard=null, qStats={ok:0,ng:0};
async function startQuiz() {
  const { data: vocab } = await sb.from('vocab').select('*');
  const empty=document.getElementById('quiz-empty'), area=document.getElementById('quiz-area');
  if (!vocab||!vocab.length) { empty.style.display='block'; area.style.display='none'; return; }
  empty.style.display='none'; area.style.display='block';
  queue = [];
  vocab.forEach(v => {
    const w = Math.max(1, 1+(v.wrong||0)*2);
    queue.push({ v, dir: Math.random()<0.5?'en2jp':'jp2en', weight: w });
  });
  queue.sort((a,b)=>b.weight-a.weight);
  const mid=Math.ceil(queue.length/2);
  const light=queue.splice(mid).sort(()=>Math.random()-0.5);
  light.forEach((item,i)=>queue.splice(mid+i,0,item));
  qStats={ok:0,ng:0};
  document.getElementById('quiz-input').style.display='block';
  document.querySelector('.quiz-actions').style.display='flex';
  nextQ();
}
function nextQ() {
  const banner=document.getElementById('result-banner');
  banner.style.display='none'; banner.className='result-banner';
  document.getElementById('hint-text').style.display='none';
  document.getElementById('hint-btn').textContent=t('btn-hint');
  document.getElementById('quiz-input').disabled=false;
  document.getElementById('quiz-input').value='';
  if (!queue.length) {
    const total=qStats.ok+qStats.ng;
    document.getElementById('quiz-word').textContent=t('quiz-complete');
    document.getElementById('quiz-dir').textContent=total ? t('quiz-rate')+Math.round(qStats.ok/total*100)+'%' : '';
    document.getElementById('quiz-input').style.display='none';
    document.querySelector('.quiz-actions').style.display='none';
    document.getElementById('hint-btn').style.display='none';
    updateQStats(false); return;
  }
  currentCard=queue.shift();
  document.getElementById('hint-btn').style.display='block';
  document.getElementById('quiz-input').style.display='block';
  document.querySelector('.quiz-actions').style.display='flex';
  const {v,dir}=currentCard;
  document.getElementById('quiz-dir').textContent  = t(dir==='en2jp'?'quiz-dir-en2jp':'quiz-dir-jp2en');
  document.getElementById('quiz-word').textContent = dir==='en2jp'?v.en:v.jp;
  document.getElementById('hint-text').textContent = v.note||'—';
  document.getElementById('quiz-input').focus();
  updateQStats(true);
}
// trim・小文字化・全角半角統一(NFKC)・カタカナ→ひらがな
function normalizeAnswer(s) {
  let x = String(s).trim().toLowerCase().normalize('NFKC');
  x = x.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  return x.replace(/\s+/g, ' ').trim();
}
function stripArticle(s) { return s.replace(/^(a|an|the)\s+/, ''); }

// 複数訳語（、 , / ・ ;区切り）のいずれか一致で正解。英語は冠詞無視+軽微なタイポ許容
function judgeAnswer(ans, correct) {
  const a = normalizeAnswer(ans);
  if (!a) return { ok: false, typo: false };
  for (const cand of String(correct).split(/[、,/・;；]/)) {
    const c = normalizeAnswer(cand);
    if (!c) continue;
    if (a === c) return { ok: true, typo: false };
    const as = stripArticle(a), cs = stripArticle(c);
    if (as === cs) return { ok: true, typo: false };
    if (cs.length >= 5 && /^[\x20-\x7e]+$/.test(cs) && levenshtein(as, cs) === 1) {
      return { ok: true, typo: true };
    }
  }
  return { ok: false, typo: false };
}

async function checkAnswer() {
  const input=document.getElementById('quiz-input');
  const ans=input.value.trim();
  if (!ans||!currentCard) return;
  const {v,dir}=currentCard;
  const correct=dir==='en2jp'?v.jp:v.en;
  const { ok: isOk, typo } = judgeAnswer(ans, correct);
  const banner=document.getElementById('result-banner');
  banner.style.display='block';
  if (isOk) {
    qStats.ok++; banner.className='result-banner result-ok';
    banner.textContent=t('quiz-correct')+correct+'」'+(typo?t('quiz-typo-note'):'');
    await sb.from('vocab').update({correct:(v.correct||0)+1}).eq('id',v.id);
  } else {
    qStats.ng++; banner.className='result-banner result-ng';
    banner.textContent=t('quiz-wrong')+correct+'」';
    await sb.from('vocab').update({wrong:(v.wrong||0)+1}).eq('id',v.id);
  }
  input.disabled=true; updateQStats(true); setTimeout(nextQ,1600);
}
function skipQ() { if(currentCard){queue.push(currentCard);nextQ();} }
function toggleHint() {
  const el=document.getElementById('hint-text'),btn=document.getElementById('hint-btn');
  const vis=el.style.display!=='none';
  el.style.display=vis?'none':'block';
  btn.textContent=vis?t('btn-hint'):t('btn-hint-hide');
}
function updateQStats(hasCard) {
  document.getElementById('q-ok').textContent  =qStats.ok;
  document.getElementById('q-ng').textContent  =qStats.ng;
  document.getElementById('q-left').textContent=queue.length+(hasCard&&currentCard?1:0);
  const total=qStats.ok+qStats.ng+queue.length+(hasCard&&currentCard?1:0);
  const done=qStats.ok+qStats.ng;
  document.getElementById('q-bar').style.width=total?Math.round(done/total*100)+'%':'0%';
}

// ── Gemini (Cloudflare Worker 経由) ─────────────────────────────────────────
async function callGemini(prompt, schema) {
  const body = JSON.stringify({ prompt, schema });

  for (let attempt = 0; ; attempt++) {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await new Promise(r => setTimeout(r, 2500));
      continue;
    }
    if (res.status === 401) throw new Error(t('alert-auth-error'));
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#1C1A16;color:#fff;padding:10px 20px;border-radius:8px;
      font-size:14px;z-index:999;opacity:0;transition:opacity 0.2s;
      white-space:nowrap;max-width:90vw;text-align:center;pointer-events:none`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}
