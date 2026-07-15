'use strict';

// ── Config ────────────────────────────────────────────────────────────────
const LS = { get: k => localStorage.getItem(k), set: (k,v) => localStorage.setItem(k,v) };
const WORKER_URL = 'https://english-diary-gemini-proxy.taku-yoshio0224.workers.dev';
const SUPABASE_URL = 'https://swbbslowwklhptqsaixn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3YmJzbG93d2tsaHB0cXNhaXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTcwNjcsImV4cCI6MjA5Nzc5MzA2N30.T_7VD3emSP6DbwCpYkhIjO6yRmueuNeXUkldpaGGp3c';
let currentUserId = null;
let currentUserEmail = '';
let currentProfile = null;
const SHADOWING_TARGETS = { easy: 10, normal: 20, hard: 50 };

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
    'btn-back-entries': '← 履歴に戻る',
    'ph-v-jp': '日本語', 'ph-v-note': 'メモ（任意）', 'btn-vocab-add': '追加',
    'vocab-empty-text': '単語帳が空です<br>日記を書いて追加しよう',
    'quiz-empty': '単語帳に単語を追加してからテストしよう',
    'stat-ok': '正解', 'stat-ng': '不正解', 'stat-left': '残り', 'stat-streak': '連続',
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
    'quiz-dir-en2jp': '英語 → 日本語', 'quiz-dir-jp2en': '日本語 → 英語', 'quiz-dir-listen': '🎧 聞いて和訳',
    'btn-quiz-listen': '🔊 もう一度聞く', 'quiz-streak-toast': '連続正解！',
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
    // Onboarding / Settings preferences
    'onboarding-title': 'ようこそ！', 'onboarding-sub': 'あなたに合わせて学習をカスタマイズします',
    'pref-skill-label': '伸ばしたいスキル（複数選択可）',
    'skill-grammar': '文法', 'skill-vocabulary': '語彙', 'skill-naturalness': '表現・自然さ', 'skill-pronunciation': '発音',
    'pref-shadowing-label': 'シャドーイングレベル',
    'level-easy': 'Easy（10回）', 'level-normal': 'Normal（20回）', 'level-hard': 'Hard（50回）',
    'pref-auto-lookup-label': '単語のAI自動検索をオンにする',
    'btn-onboarding-start': 'はじめる →',
    'toast-prefs-saved': '設定を保存しました',
    // Categorized feedback
    'cat-grammar': '文法', 'cat-vocabulary': '語彙', 'cat-expression': '表現', 'cat-other': 'その他',
    // Shadowing gate
    'btn-shadow-skip': 'スキップして発音チェックへ',
    // Pronunciation tips
    'loading-pron-tips': '発音のヒントを生成中…', 'pron-tips-label': '💡 発音のヒント',
    // Vocab lookup
    'loading-vocab-lookup': 'AIで調べています…', 'error-vocab-lookup': '単語検索エラー: ',
    // Timeout
    'error-ai-timeout': '応答に時間がかかりすぎたため中断しました。もう一度お試しください',
    // First pronunciation attempt
    'first-attempt-label': '📌 初回の結果',
    'first-attempt-score-label': '初回スコア: {score}%',
    'first-attempt-all-correct': 'すべて認識されました！',
    // Situational sentence practice
    'quiz-mode-flashcard': '単語テスト', 'quiz-mode-situational': '状況文で練習',
    'situational-target-label': '使う単語', 'situational-or': 'または英語でタイピング',
    'ph-situational-answer': 'ここに英語で回答…', 'btn-situational-grade': 'AI採点',
    'btn-situational-next': '次の問題へ →',
    'loading-situational': 'AIがシチュエーションを作成中…', 'loading-situational-grading': 'AIが採点中…',
    'situational-correct': '✓ よくできました！', 'situational-incorrect': '✗ もう少し！下の添削を見てみよう',
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
    'btn-back-entries': '← Back to history',
    'ph-v-jp': 'Translation', 'ph-v-note': 'Note (optional)', 'btn-vocab-add': 'Add',
    'vocab-empty-text': 'Your vocabulary is empty<br>Write a diary to add words',
    'quiz-empty': 'Add words to your vocabulary first',
    'stat-ok': 'Correct', 'stat-ng': 'Wrong', 'stat-left': 'Left', 'stat-streak': 'Streak',
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
    'quiz-dir-en2jp': 'English → Translation', 'quiz-dir-jp2en': 'Translation → English', 'quiz-dir-listen': '🎧 Listen & translate',
    'btn-quiz-listen': '🔊 Play again', 'quiz-streak-toast': 'in a row!',
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
    // Onboarding / Settings preferences
    'onboarding-title': 'Welcome!', 'onboarding-sub': "Let's personalize your learning",
    'pref-skill-label': 'Skills to focus on (choose any)',
    'skill-grammar': 'Grammar', 'skill-vocabulary': 'Vocabulary', 'skill-naturalness': 'Expression & naturalness', 'skill-pronunciation': 'Pronunciation',
    'pref-shadowing-label': 'Shadowing level',
    'level-easy': 'Easy (10 reps)', 'level-normal': 'Normal (20 reps)', 'level-hard': 'Hard (50 reps)',
    'pref-auto-lookup-label': 'Turn on AI auto word lookup',
    'btn-onboarding-start': 'Get started →',
    'toast-prefs-saved': 'Settings saved',
    // Categorized feedback
    'cat-grammar': 'Grammar', 'cat-vocabulary': 'Vocabulary', 'cat-expression': 'Expression', 'cat-other': 'Other',
    // Shadowing gate
    'btn-shadow-skip': 'Skip to pronunciation check',
    // Pronunciation tips
    'loading-pron-tips': 'Generating pronunciation tips…', 'pron-tips-label': '💡 Pronunciation tips',
    // Vocab lookup
    'loading-vocab-lookup': 'Looking up with AI…', 'error-vocab-lookup': 'Lookup error: ',
    // Timeout
    'error-ai-timeout': 'Timed out — please try again',
    // First pronunciation attempt
    'first-attempt-label': '📌 First attempt',
    'first-attempt-score-label': 'First attempt: {score}%',
    'first-attempt-all-correct': 'All words recognized!',
    // Situational sentence practice
    'quiz-mode-flashcard': 'Word Quiz', 'quiz-mode-situational': 'Situational Practice',
    'situational-target-label': 'Words to use', 'situational-or': 'or type your answer in English',
    'ph-situational-answer': 'Type your English answer…', 'btn-situational-grade': 'AI Grade',
    'btn-situational-next': 'Next question →',
    'loading-situational': 'AI is creating a scenario…', 'loading-situational-grading': 'AI is grading…',
    'situational-correct': '✓ Well done!', 'situational-incorrect': '✗ Almost — check the correction below',
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
  await loadProfile();
  await Promise.all([loadEntries(), renderVocab()]);
  initQuizTab();
  if (!currentProfile.onboarding_completed) openOnboarding();
}

// ── Profile / Preferences ────────────────────────────────────────────────
function defaultProfile() {
  return { user_id: currentUserId, onboarding_completed: false, skill_focus: [], shadowing_level: 'normal', auto_vocab_lookup: false };
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('user_id', currentUserId).maybeSingle();
  currentProfile = data || defaultProfile();
}

function collectPreferenceForm(prefix) {
  const skill_focus = Array.from(document.querySelectorAll(`.${prefix}-skill:checked`)).map(el => el.value);
  const shadowingEl = document.querySelector(`input[name="${prefix}-shadowing"]:checked`);
  return {
    user_id: currentUserId,
    onboarding_completed: true,
    skill_focus,
    shadowing_level: shadowingEl ? shadowingEl.value : 'normal',
    auto_vocab_lookup: !!document.getElementById(`${prefix}-auto-lookup`).checked,
    updated_at: new Date().toISOString(),
  };
}

function openOnboarding() {
  document.getElementById('onboarding-modal').style.display = 'flex';
}

async function completeOnboarding() {
  const payload = collectPreferenceForm('onboarding');
  const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) { alert(t('error-save') + error.message); return; }
  currentProfile = payload;
  closeModal('onboarding-modal');
}

function populateSettingsPreferences(profile) {
  document.querySelectorAll('.settings-skill').forEach(el => {
    el.checked = (profile.skill_focus || []).includes(el.value);
  });
  document.querySelectorAll('input[name="settings-shadowing"]').forEach(el => {
    el.checked = el.value === (profile.shadowing_level || 'normal');
  });
  document.getElementById('settings-auto-lookup').checked = !!profile.auto_vocab_lookup;
}

async function savePreferences() {
  const payload = collectPreferenceForm('settings');
  const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) { alert(t('error-save') + error.message); return; }
  currentProfile = payload;
  showToast(t('toast-prefs-saved'));
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
  populateSettingsPreferences(currentProfile || defaultProfile());
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
  if (name === 'quiz')    initQuizTab();
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
  el.classList.add('just-unlocked');
  setTimeout(() => el.classList.remove('just-unlocked'), 500);
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
      <input type="text" class="input word-jp" placeholder="${t('ph-word-jp')}" value="${escapeHtml(jp)}" onblur="autoLookupOnBlur(this,'jp2en')" />
      <span class="arrow">→</span>
      <input type="text" class="input word-en" placeholder="${t('ph-word-en')}" onblur="autoLookupOnBlur(this,'en2jp')" />
      <button class="icon-btn red" onclick="removeWordRow(this)">✕</button>
    </div>
    <textarea class="input word-note" placeholder="${t('ph-word-note')}"></textarea>
  `;
  document.getElementById('unknown-words-list').appendChild(row);
}
function findEmptyWordRow() {
  return Array.from(document.querySelectorAll('.word-row')).find(row =>
    !row.querySelector('.word-jp').value.trim() &&
    !row.querySelector('.word-en').value.trim() &&
    !row.querySelector('.word-note').value.trim()
  ) || null;
}
function findOrCreateEmptyWordRow(jp = '') {
  let row = findEmptyWordRow();
  if (row) {
    if (jp) row.querySelector('.word-jp').value = jp;
  } else {
    addWordRow(jp);
    row = document.getElementById('unknown-words-list').lastElementChild;
  }
  return row;
}
function addWordNote() {
  const input = document.getElementById('s2-word-note');
  const jp = input.value.trim();
  if (!jp) return;
  findOrCreateEmptyWordRow(jp);
  input.value = '';
  showToast(t('toast-word-note-added'));
}
function removeWordRow(btn) {
  const rows = document.querySelectorAll('.word-row');
  if (rows.length > 1) btn.closest('.word-row').remove();
}

// ── AI単語自動検索（トグルON時、Step3の入力欄からフォーカスが外れたら発火） ──
const VOCAB_LOOKUP_SCHEMA = {
  type: 'object',
  properties: { translation: { type: 'string' }, note: { type: 'string' } },
  required: ['translation'],
};

function buildVocabLookupPrompt(word, direction, contextJp) {
  return direction === 'jp2en'
    ? `Translate this Japanese word/phrase into natural, commonly-used English suitable for a diary sentence: "${word}". Diary context (for disambiguation): "${contextJp || ''}". Return the best single English translation in "translation", and optionally a very short (max 15 words) usage note in "note" (leave "note" empty if not needed).`
    : `Translate this English word/phrase into natural Japanese: "${word}". Return the best single Japanese translation in "translation", and optionally a very short usage note in "note".`;
}

const _lastLookupValue = new WeakMap();

async function autoLookupOnBlur(input, direction) {
  if (!currentProfile?.auto_vocab_lookup) return;
  const row = input.closest('.word-row');
  const jpInput = row.querySelector('.word-jp'), enInput = row.querySelector('.word-en');
  const jp = jpInput.value.trim(), en = enInput.value.trim();
  const word = direction === 'jp2en' ? jp : en;
  const otherFilled = direction === 'jp2en' ? en : jp;
  if (!word || otherFilled) return;
  if (_lastLookupValue.get(input) === word) return;
  _lastLookupValue.set(input, word);

  const targetInput = direction === 'jp2en' ? enInput : jpInput;
  const noteEl = row.querySelector('.word-note');
  const original = targetInput.value;
  targetInput.disabled = true;
  targetInput.placeholder = t('loading-vocab-lookup');
  try {
    const contextJp = document.getElementById('diary-jp').value.trim();
    const res = await callGemini(buildVocabLookupPrompt(word, direction, contextJp), VOCAB_LOOKUP_SCHEMA);
    const data = JSON.parse(res);
    if (!targetInput.value.trim()) targetInput.value = data.translation || '';
    if (data.note && !noteEl.value.trim()) noteEl.value = data.note;
  } catch (e) {
    showToast(t('error-vocab-lookup') + e.message);
    targetInput.value = original;
  } finally {
    targetInput.disabled = false;
    targetInput.placeholder = direction === 'jp2en' ? t('ph-word-en') : t('ph-word-jp');
  }
}

// ── STEP 3 → 4 ───────────────────────────────────────────────────────────
function goStep4() {
  const jp = document.getElementById('diary-jp').value.trim();
  document.getElementById('jp-ref-4').textContent = jp;

  const en2El = document.getElementById('diary-en2');
  if (!en2El.value.trim()) en2El.value = document.getElementById('diary-en1').value.trim();

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

// ── STEP 4 → 5 (Gemini, 高速添削 + 詳細フィードバックの並列2コール) ──────────
const FAST_CORRECTION_SCHEMA = {
  type: 'object',
  properties: { corrected: { type: 'string' } },
  required: ['corrected'],
};

const DETAILED_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    good_points: { type: 'array', items: { type: 'string' } },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['grammar', 'vocabulary', 'expression', 'other'] },
          summary:  { type: 'string' },
          corrections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                before:      { type: 'string' },
                after:       { type: 'string' },
                explanation: { type: 'string' },
                jp:          { type: 'string' },
              },
              required: ['before', 'after', 'explanation'],
            },
          },
        },
        required: ['category', 'corrections'],
      },
    },
    vocab_usage: { type: 'string' },
  },
  required: ['good_points', 'categories'],
};

const SKILL_FOCUS_LABELS = {
  grammar: 'grammar',
  vocabulary: 'vocabulary and word choice',
  naturalness: 'natural, native-like expression',
};

function buildFastCorrectionPrompt(jp, en1, en2) {
  return `You are an experienced native English teacher.

Original diary entry (learner's native language): "${jp}"
Student's 1st English attempt: "${en1 || '(none)'}"
Student's 2nd English attempt: "${en2}"

Return ONLY the single most natural native-English rewrite of the 2nd attempt in the "corrected" field. Keep the same meaning and personal tone, keep the student's wording wherever it is already correct, and do not add information that is not in the diary. Do not include any explanation.`;
}

function buildDetailedFeedbackPrompt(jp, en1, words, en2, skillFocus) {
  const chosen = (skillFocus || []).filter(f => f in SKILL_FOCUS_LABELS);
  const focusInstruction = chosen.length
    ? `The student specifically wants to improve: ${chosen.map(f => SKILL_FOCUS_LABELS[f]).join(', ')}. For these categories, look harder for issues and give deeper, more detailed explanations (aim for 2-4 items). For categories NOT listed, keep it brief (0-2 items, or omit the category entirely if nothing notable).`
    : `The student has no specific focus area this time — give balanced feedback, aiming for roughly 1-3 items per relevant category.`;

  return `You are an experienced native English teacher helping a language learner improve through diary writing.

Original diary entry (learner's native language): "${jp}"
Student's 1st English attempt: "${en1 || '(none)'}"
Vocabulary the student looked up: ${words.length ? words.join(', ') : '(none)'}
Student's 2nd English attempt (after looking up words): "${en2}"

${focusInstruction}

Fill in the JSON fields as follows:
- "good_points": exactly 2 specific things the student did well.
- "categories": group corrections into up to 4 categories — "grammar" (tense, articles, agreement, sentence structure), "vocabulary" (word choice, collocations), "expression" (naturalness, tone, phrasing, flow), and "other" (spelling, punctuation, register, or anything not covered above). Only include a category object if there's at least one correction or a summary comment. For each category, optionally add a one-sentence "summary", and a "corrections" array where each item has "before", "after", "explanation" (one short sentence), and — ONLY for "vocabulary" — "jp" with a short Japanese translation of "after".
- "vocab_usage": if the student looked up vocabulary, one short comment on whether they used those words correctly; otherwise an empty string.

Be encouraging and specific. Write "good_points", every "summary", every "explanation", and "vocab_usage" in ${t('feedback-lang')}.`;
}

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
  renderCategorizedFeedback([]);
  const stopProgress = startAiProgress();

  const jp  = document.getElementById('diary-jp').value.trim();
  const en1 = document.getElementById('diary-en1').value.trim();

  const words = [];
  document.querySelectorAll('.word-row').forEach(row => {
    const wj = row.querySelector('.word-jp').value.trim();
    const we = row.querySelector('.word-en').value.trim();
    if (wj && we) words.push(`${wj} → ${we}`);
  });

  window._correctedText = en2;
  window._lastFeedback  = null;

  const fastPromise = callGemini(buildFastCorrectionPrompt(jp, en1, en2), FAST_CORRECTION_SCHEMA)
    .then(res => {
      const data = JSON.parse(res);
      if (!data.corrected) throw new Error('empty response');
      correctedEl.textContent = data.corrected;
      window._correctedText = data.corrected;
    })
    .catch(e => {
      correctedEl.textContent = en2 + '\n\n(' + t('error-ai') + e.message + ')';
      window._correctedText = en2;
    });

  const detailedPromise = callGemini(
    buildDetailedFeedbackPrompt(jp, en1, words, en2, currentProfile?.skill_focus || []),
    DETAILED_FEEDBACK_SCHEMA
  ).then(res => {
    const data = JSON.parse(res);
    renderFeedback(data);
    renderCategorizedFeedback(data.categories);
    window._lastFeedback = {
      good_points: data.good_points || [],
      categories:  data.categories  || [],
      vocab_usage: data.vocab_usage || '',
    };
  }).catch(e => {
    feedbackEl.textContent = '(' + t('error-ai') + e.message + ')';
    renderCategorizedFeedback([]);
  });

  await Promise.allSettled([fastPromise, detailedPromise]);
  stopProgress();
}

function renderFeedback(data, feedbackElId = 'ai-feedback-text') {
  const el = document.getElementById(feedbackElId);
  const section = (label, items) => items && items.length
    ? `<div class="fb-section"><div class="fb-head">${t(label)}</div><ul class="fb-list">${items.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
    : '';
  let html = section('fb-good', data.good_points) + section('fb-improve', data.improvements);
  if (data.vocab_usage) {
    html += `<div class="fb-section"><div class="fb-head">${t('fb-vocab')}</div><p>${escapeHtml(data.vocab_usage)}</p></div>`;
  }
  el.innerHTML = html;
}

// 旧形式（type別フラットリスト）のレンダラー。旧エントリの表示用に維持。
function renderCorrections(list, boxId = 'ai-corrections-box', listId = 'ai-corrections-list') {
  const box = document.getElementById(boxId);
  const el  = document.getElementById(listId);
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

// 新形式（文法/語彙/表現/その他カテゴリ別）のレンダラー
const CATEGORY_ORDER = ['grammar', 'vocabulary', 'expression', 'other'];

function renderCategorizedFeedback(categories, boxId = 'ai-corrections-box', listId = 'ai-corrections-list') {
  const box = document.getElementById(boxId);
  const el  = document.getElementById(listId);
  if (!categories || !categories.length) { box.style.display = 'none'; el.innerHTML = ''; return; }
  box.style.display = 'block';
  const ordered = CATEGORY_ORDER.map(k => categories.find(c => c.category === k)).filter(Boolean);
  el.innerHTML = ordered.map(cat => `
    <div class="fb-category fb-category-${escapeHtml(cat.category)}">
      <div class="fb-category-head">
        <span class="fb-category-tag">${escapeHtml(t('cat-' + cat.category))}</span>
        ${cat.summary ? `<span class="fb-category-summary">${escapeHtml(cat.summary)}</span>` : ''}
      </div>
      ${(cat.corrections || []).map(c => `
        <div class="correction-item">
          <div class="correction-diff">
            <span class="corr-before">${escapeHtml(c.before)}</span>
            <span class="corr-arrow">→</span>
            <span class="corr-after">${escapeHtml(c.after)}</span>
          </div>
          <div class="correction-exp">${escapeHtml(c.explanation)}</div>
        </div>`).join('')}
    </div>`).join('');
}

// ── TTS (ブラウザ内蔵 Web Speech API) ────────────────────────────────────
function speakText(text, onRepEnd) {
  const btn = document.getElementById('tts-btn');
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 0.9;
  const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  if (voices.length) utter.voice = voices[0];
  utter.onend = () => {
    if (btn) { btn.textContent = t('btn-tts-replay'); btn.disabled = false; }
    if (onRepEnd) onRepEnd();
  };
  if (btn) { btn.textContent = t('btn-tts-playing'); btn.disabled = false; }
  speechSynthesis.speak(utter);
}

function speakCorrected() {
  const text = document.getElementById('ai-corrected-text').textContent;
  if (!text || text.includes('添削中') || text.includes('correcting')) return;
  speakText(text);
}

function playShadowingRep(text) {
  const btn = document.getElementById('hear-target-btn');
  if (btn) btn.disabled = true;
  speakText(text, () => {
    registerShadowingRep();
    if (btn) btn.disabled = false;
  });
}

function speakTarget() {
  const text = document.getElementById('target-sentence').textContent;
  if (text) playShadowingRep(text);
}

// ── Shadowing gate (Step 6) ──────────────────────────────────────────────
let shadowingReps = 0;
let shadowingTarget = SHADOWING_TARGETS.normal;

function resetShadowingGate() {
  shadowingReps = 0;
  shadowingTarget = SHADOWING_TARGETS[currentProfile?.shadowing_level || 'normal'];
  updateShadowingUI();
  document.getElementById('step6-speech-area').classList.add('gated');
}
function registerShadowingRep() {
  shadowingReps++;
  updateShadowingUI();
}
function updateShadowingUI() {
  const pct = Math.min(100, Math.round(shadowingReps / shadowingTarget * 100));
  document.getElementById('shadow-progress-bar').style.width = pct + '%';
  document.getElementById('shadow-progress-label').textContent =
    `${Math.min(shadowingReps, shadowingTarget)} / ${shadowingTarget}`;
  if (shadowingReps >= shadowingTarget) {
    document.getElementById('step6-speech-area').classList.remove('gated');
  }
}
function skipShadowingGate() {
  shadowingReps = shadowingTarget;
  updateShadowingUI();
}

let _modalCorrectedText = '';
function speakModalText() { if (_modalCorrectedText) speakText(_modalCorrectedText); }

// ── STEP 5 → 6 ───────────────────────────────────────────────────────────
function goStep6() {
  const corrected = window._correctedText || document.getElementById('ai-corrected-text').textContent;
  document.getElementById('target-sentence').textContent = corrected;
  unlock('step6-card');
  resetShadowingGate();
  firstPronunciationAttempt = null;
  document.getElementById('speech-first-attempt').style.display = 'none';
  setTimeout(() => playShadowingRep(corrected), 400);
}

// ── Web Speech API (Step 6 / 過去日記詳細ページ共通) ───────────────────────
const STEP6_CTX  = { target: 'target-sentence', micBtn: 'mic-btn', result: 'speech-result', text: 'speech-text', score: 'speech-score', feedback: 'word-feedback', tips: 'pron-tips' };
const DETAIL_CTX = { target: 'detail-corrected', micBtn: 'detail-mic-btn', result: 'detail-speech-result', text: 'detail-speech-text', score: 'detail-speech-score', feedback: 'detail-word-feedback', tips: 'detail-pron-tips' };

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
      if (ctx.onFinal) {
        ctx.onFinal(transcript);
      } else {
        const prefix = Array.from(e.results).slice(0, -1).map(r => r[0].transcript).join(' ');
        const alternatives = Array.from(last).map(a => (prefix + ' ' + a.transcript).trim());
        scorePronunciation(alternatives, ctx);
      }
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
  const tokenMatched = tokens.map((_, ti) => {
    const idxs = tokenOf.reduce((acc, tv, i) => (tv === ti ? (acc.push(i), acc) : acc), []);
    return idxs.length ? idxs.every(i => best.flags[i]) : true;
  });
  const missedWords = tokens.filter((_, ti) => !tokenMatched[ti]).slice(0, 8);

  const wfEl = document.getElementById(ctx.feedback);
  if (wfEl) {
    const anyMiss = tokenMatched.some(m => !m);
    wfEl.innerHTML = tokens.map((tok, ti) =>
      `<span class="wf-word ${tokenMatched[ti] ? 'wf-ok' : 'wf-miss'}">${escapeHtml(tok)}</span>`
    ).join(' ') + (anyMiss ? `<div class="wf-hint">${escapeHtml(t('word-feedback-hint'))}</div>` : '');
    wfEl.style.display = 'block';

    maybeFetchPronunciationTips(missedWords, ctx);
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

  recordFirstAttemptIfNeeded(ctx, {
    score, missedWords,
    transcript: document.getElementById(ctx.text).textContent,
    scoredAt: new Date().toISOString(),
  });
}

// ── 初回発音チェック結果の保存（リトライでは上書きしない） ──────────────
let firstPronunciationAttempt = null;

function recordFirstAttemptIfNeeded(ctx, attempt) {
  if (ctx === STEP6_CTX) {
    if (!firstPronunciationAttempt) firstPronunciationAttempt = attempt;
  } else if (ctx === DETAIL_CTX) {
    if (!_modalEntryData?.pronunciation_first_attempt) {
      _modalEntryData.pronunciation_first_attempt = attempt;
      sb.from('entries').update({ pronunciation_first_attempt: attempt }).eq('id', _modalEntryId);
    }
  }
  renderFirstAttemptBadge(ctx);
}

function renderFirstAttemptBadge(ctx, attemptOverride) {
  const boxId = ctx === STEP6_CTX ? 'speech-first-attempt' : 'detail-first-attempt';
  const box = document.getElementById(boxId);
  if (!box) return;
  const data = attemptOverride !== undefined ? attemptOverride
    : (ctx === STEP6_CTX ? firstPronunciationAttempt : _modalEntryData?.pronunciation_first_attempt);
  if (!data) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  const scoreEl = box.querySelector('.first-attempt-score');
  scoreEl.className = 'first-attempt-score speech-score ' +
    (data.score >= 80 ? 'score-great' : data.score >= 50 ? 'score-ok' : 'score-try');
  scoreEl.textContent = t('first-attempt-score-label').replace('{score}', data.score);
  box.querySelector('.first-attempt-words').innerHTML = data.missedWords.length
    ? data.missedWords.map(w => `<span class="wf-word wf-miss">${escapeHtml(w)}</span>`).join(' ')
    : `<span class="wf-word wf-ok">${escapeHtml(t('first-attempt-all-correct'))}</span>`;
}

// ── 発音アドバイス（不一致単語のみ、非同期・fire-and-forget） ─────────────
const PRONUNCIATION_TIPS_SCHEMA = {
  type: 'object',
  properties: {
    tips: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, tip: { type: 'string' } },
        required: ['word', 'tip'],
      },
    },
  },
  required: ['tips'],
};

function buildPronunciationTipsPrompt(missedWords, detailed) {
  const depthInstruction = detailed
    ? 'Give a slightly more detailed tip (mouth/tongue position or a rhyming/sound-alike cue) in 1-2 short sentences.'
    : 'Give a very short, practical tip (max 1 sentence) — e.g. which syllable to stress, a commonly confused sound, or a similar-sounding word.';
  return `A Japanese learner of English tried to say the following English words but a speech recognizer failed to detect them correctly (usually mispronunciation, but could be recognizer error — give your best-effort pronunciation guidance assuming mispronunciation):

Words: ${missedWords.join(', ')}

For each word, ${depthInstruction} Write tips in ${t('feedback-lang')}. Return one entry per word in "tips", preserving the given spelling in "word".`;
}

const _lastTipsKey = {};
async function maybeFetchPronunciationTips(missedTokens, ctx) {
  const tipsEl = document.getElementById(ctx.tips);
  if (!tipsEl) return;
  const key = missedTokens.join('|').toLowerCase();
  if (!key) { tipsEl.style.display = 'none'; tipsEl.innerHTML = ''; _lastTipsKey[ctx.tips] = ''; return; }
  if (_lastTipsKey[ctx.tips] === key) return;
  _lastTipsKey[ctx.tips] = key;
  tipsEl.style.display = 'block';
  tipsEl.innerHTML = `<span class="loading-text">${t('loading-pron-tips')}</span>`;
  try {
    const detailed = (currentProfile?.skill_focus || []).includes('pronunciation');
    const res = await callGemini(buildPronunciationTipsPrompt(missedTokens, detailed), PRONUNCIATION_TIPS_SCHEMA);
    renderPronunciationTips(JSON.parse(res).tips || [], ctx);
  } catch (e) {
    tipsEl.style.display = 'none';
    tipsEl.innerHTML = '';
  }
}

function renderPronunciationTips(tips, ctx) {
  const el = document.getElementById(ctx.tips);
  if (!tips.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = `<div class="ai-label">${t('pron-tips-label')}</div>` + tips.map(tp =>
    `<div class="pron-tip-item"><span class="pron-tip-word">${escapeHtml(tp.word)}</span><span class="pron-tip-text">${escapeHtml(tp.tip)}</span></div>`
  ).join('');
  el.style.display = 'block';
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

  (window._lastFeedback?.categories || []).forEach(cat => {
    if (cat.category !== 'vocabulary') return;
    (cat.corrections || []).forEach(c => {
      if (c.jp && c.after) newWords.push({ jp: c.jp, en: c.after, note: c.explanation || '' });
    });
  });

  const { error } = await sb.from('entries').insert({
    date: todayISO(), jp, en1, en2, corrected, feedback: window._lastFeedback || null,
    pronunciation_first_attempt: firstPronunciationAttempt, user_id: currentUserId,
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
  window._correctedText = '';
  window._lastFeedback  = null;
  ['step2-card','step3-card','step4-card','step5-card','step6-card'].forEach(id => lock(id));
  document.getElementById('speech-result').style.display = 'none';
  document.getElementById('ai-corrected-text').textContent = '';
  document.getElementById('ai-feedback-text').textContent  = '';
  renderCorrections([]);
  document.getElementById('word-feedback').innerHTML = '';
  document.getElementById('target-sentence').textContent   = '';
  firstPronunciationAttempt = null;
  document.getElementById('speech-first-attempt').style.display = 'none';

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
      <div class="entry-card" onclick="openEntryDetail(${e.id})">
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

async function openEntryDetail(id) {
  const { data } = await sb.from('entries').select('*').eq('id', id).single();
  if (!data) return;
  _modalEntryId   = data.id;
  _modalEntryData = data;
  document.getElementById('detail-date').textContent      = fmtDate(data.date);
  document.getElementById('detail-jp').textContent        = data.jp || '—';
  document.getElementById('detail-en1').textContent       = data.en1 || '—';
  document.getElementById('detail-en2').textContent       = data.en2 || '—';
  document.getElementById('detail-corrected').textContent = data.corrected || '—';
  _modalCorrectedText = data.corrected || '';
  document.getElementById('detail-speech-result').style.display = 'none';
  document.getElementById('detail-speech-text').textContent = '';
  document.getElementById('detail-word-feedback').innerHTML = '';
  document.getElementById('detail-pron-tips').style.display = 'none';
  document.getElementById('detail-pron-tips').innerHTML = '';
  _lastTipsKey['detail-pron-tips'] = '';
  renderFirstAttemptBadge(DETAIL_CTX, data.pronunciation_first_attempt || null);
  renderFeedback(data.feedback || {}, 'detail-feedback-text');
  if (data.feedback?.categories) {
    renderCategorizedFeedback(data.feedback.categories, 'detail-corrections-box', 'detail-corrections-list');
  } else {
    renderCorrections(data.feedback?.corrections || [], 'detail-corrections-box', 'detail-corrections-list');
  }
  setEntryEditMode(false);

  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-entry-detail').classList.add('active');
  window.scrollTo({ top: 0 });
}

function backToEntries() { switchTab('entries'); }

function setEntryEditMode(on) {
  ENTRY_EDIT_FIELDS.forEach(f => {
    document.getElementById('detail-' + f).style.display = on ? 'none' : 'block';
    document.getElementById('detail-' + f + '-edit').style.display = on ? 'block' : 'none';
  });
  document.getElementById('detail-edit-btn').style.display = on ? 'none' : 'inline-block';
  document.getElementById('detail-edit-actions').style.display = on ? 'block' : 'none';
}

function toggleEntryEdit() {
  ENTRY_EDIT_FIELDS.forEach(f => {
    document.getElementById('detail-' + f + '-edit').value = _modalEntryData[f] || '';
  });
  setEntryEditMode(true);
}

function cancelEntryEdit() { setEntryEditMode(false); }

async function saveEntryEdit() {
  const vals = {};
  ENTRY_EDIT_FIELDS.forEach(f => { vals[f] = document.getElementById('detail-' + f + '-edit').value.trim(); });
  const { error } = await sb.from('entries').update(vals).eq('id', _modalEntryId);
  if (error) { alert(t('error-save') + error.message); return; }
  _modalEntryData = { ..._modalEntryData, ...vals };
  ENTRY_EDIT_FIELDS.forEach(f => {
    document.getElementById('detail-' + f).textContent = vals[f] || '—';
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

// ── SRS（間隔反復・エビングハウスの忘却曲線を参考にした固定ステージ方式） ──
const SRS_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 90];

async function fetchDueVocab(limit = 20, preloaded = null) {
  const vocab = preloaded || (await sb.from('vocab').select('*')).data || [];
  const now = Date.now();
  const due = vocab
    .filter(v => new Date(v.next_review_at || 0).getTime() <= now)
    .sort((a, b) => new Date(a.next_review_at || 0) - new Date(b.next_review_at || 0));
  if (due.length >= limit) return due.slice(0, limit).sort(() => Math.random() - 0.5);
  const dueIds = new Set(due.map(v => v.id));
  const notDue = vocab.filter(v => !dueIds.has(v.id));
  // まだ期限が来ていない単語は、理解度（srs_stage）が低いほど出やすいよう重み付けして補充
  const weighted = notDue
    .map(v => ({ v, w: Math.random() / (1 + (v.srs_stage || 0)) }))
    .sort((a, b) => b.w - a.w)
    .map(x => x.v);
  return due.concat(weighted.slice(0, limit - due.length)).sort(() => Math.random() - 0.5);
}

function computeSrsUpdate(v, isOk) {
  const stage = isOk
    ? Math.min((v.srs_stage || 0) + 1, SRS_INTERVALS_DAYS.length - 1)
    : Math.max((v.srs_stage || 0) - 2, 0);
  return {
    srs_stage: stage,
    next_review_at: new Date(Date.now() + SRS_INTERVALS_DAYS[stage] * 86400000).toISOString(),
    last_reviewed_at: new Date().toISOString(),
  };
}

// ── Quiz ──────────────────────────────────────────────────────────────────
let queue=[], currentCard=null, qStats={ok:0,ng:0,streak:0};
async function startQuiz() {
  const { data: vocab } = await sb.from('vocab').select('*');
  allVocab = vocab || [];
  const empty=document.getElementById('quiz-empty'), area=document.getElementById('quiz-area');
  if (!allVocab.length) { empty.style.display='block'; area.style.display='none'; return; }
  empty.style.display='none'; area.style.display='block';
  const due = await fetchDueVocab(30, allVocab);
  queue = due.map(v => {
    const type = pickQuestionType();
    const dir = type === 'listen' ? 'en2jp' : (Math.random()<0.5?'en2jp':'jp2en');
    return { v, dir, type };
  });
  qStats={ok:0,ng:0,streak:0};
  document.getElementById('quiz-input').style.display='block';
  document.querySelector('.quiz-actions').style.display='flex';
  nextQ();
}
// 出題形式：recall=タイピング想起、mc=4択、listen=リスニング（英語音声→和訳入力）
function pickQuestionType() {
  const types = ['recall', 'listen'];
  if (allVocab.length >= 4) types.push('mc', 'mc');
  return types[Math.floor(Math.random()*types.length)];
}
function pickDistractors(v, dir, count=3) {
  const field = dir === 'en2jp' ? 'jp' : 'en';
  const correctKey = String(v[field]||'').trim().toLowerCase();
  const seen = new Set([correctKey]);
  const picked = [];
  allVocab
    .filter(o => o.id !== v.id && o[field] && o[field].trim())
    .sort(() => Math.random() - 0.5)
    .forEach(o => {
      const key = o[field].trim().toLowerCase();
      if (seen.has(key) || picked.length >= count) return;
      seen.add(key);
      picked.push(o[field]);
    });
  return picked;
}
function nextQ() {
  const banner=document.getElementById('result-banner');
  banner.style.display='none'; banner.className='result-banner';
  document.getElementById('hint-text').style.display='none';
  document.getElementById('hint-btn').textContent=t('btn-hint');
  if (!queue.length) {
    const total=qStats.ok+qStats.ng;
    document.getElementById('quiz-word').textContent=t('quiz-complete');
    document.getElementById('quiz-dir').textContent=total ? t('quiz-rate')+Math.round(qStats.ok/total*100)+'%' : '';
    document.getElementById('quiz-input').style.display='none';
    document.getElementById('quiz-choices').style.display='none';
    document.getElementById('quiz-listen-btn').style.display='none';
    document.querySelector('.quiz-actions').style.display='none';
    document.getElementById('hint-btn').style.display='none';
    updateQStats(false); return;
  }
  currentCard=queue.shift();
  document.getElementById('hint-btn').style.display='block';
  renderQuizCard(currentCard);
  document.getElementById('quiz-input').focus();
  updateQStats(true);
}
function renderQuizCard(card) {
  const {v,dir,type}=card;
  const input=document.getElementById('quiz-input');
  input.disabled=false;
  input.value='';
  document.getElementById('hint-text').textContent = v.note||'—';

  const isListen = type === 'listen';
  const isMc = type === 'mc';

  document.getElementById('quiz-dir').textContent = isListen
    ? t('quiz-dir-listen')
    : t(dir==='en2jp'?'quiz-dir-en2jp':'quiz-dir-jp2en');
  document.getElementById('quiz-word').textContent = isListen ? '🔊' : (dir==='en2jp'?v.en:v.jp);

  const listenBtn = document.getElementById('quiz-listen-btn');
  listenBtn.style.display = isListen ? 'inline-block' : 'none';
  if (isListen) setTimeout(() => speakText(v.en), 300);

  const choicesEl = document.getElementById('quiz-choices');
  choicesEl.innerHTML = '';
  if (isMc) {
    const correctText = dir==='en2jp'?v.jp:v.en;
    const options = pickDistractors(v, dir, 3).concat([correctText]).sort(() => Math.random()-0.5);
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-choice-btn';
      btn.textContent = opt;
      btn.onclick = () => checkChoice(btn, opt === correctText, correctText);
      choicesEl.appendChild(btn);
    });
  }
  choicesEl.style.display = isMc ? 'grid' : 'none';
  input.style.display = isMc ? 'none' : 'block';
  document.querySelector('.quiz-actions').style.display = isMc ? 'none' : 'flex';
}
function playQuizAudio() { if (currentCard) speakText(currentCard.v.en); }
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
  input.disabled=true;
  await recordQuizResult(isOk, correct, currentCard, typo);
}
function checkChoice(btn, isOk, correctText) {
  Array.from(document.getElementById('quiz-choices').children).forEach(b => b.disabled = true);
  btn.classList.add(isOk ? 'choice-correct' : 'choice-wrong');
  recordQuizResult(isOk, correctText, currentCard, false);
}
async function recordQuizResult(isOk, correctText, card, typo=false) {
  const {v} = card;
  const banner=document.getElementById('result-banner');
  banner.style.display='block';
  const srs = computeSrsUpdate(v, isOk);
  if (isOk) {
    qStats.ok++; qStats.streak++;
    banner.className='result-banner result-ok';
    banner.textContent=t('quiz-correct')+correctText+'」'+(typo?t('quiz-typo-note'):'');
    await sb.from('vocab').update({ correct:(v.correct||0)+1, ...srs }).eq('id',v.id);
    if (qStats.streak > 0 && qStats.streak % 5 === 0) showToast(`🔥 ${qStats.streak} ${t('quiz-streak-toast')}`);
  } else {
    qStats.ng++; qStats.streak=0;
    banner.className='result-banner result-ng';
    banner.textContent=t('quiz-wrong')+correctText+'」';
    await sb.from('vocab').update({ wrong:(v.wrong||0)+1, ...srs }).eq('id',v.id);
  }
  pulseQuizCard(isOk);
  updateQStats(true);
  setTimeout(nextQ,1600);
}
function pulseQuizCard(isOk) {
  const card = document.querySelector('.quiz-card');
  if (!card) return;
  const cls = isOk ? 'card-correct-pulse' : 'card-wrong-pulse';
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), 400);
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
  document.getElementById('q-streak').textContent = qStats.streak > 0 ? `${qStats.streak}🔥` : '0';
  const total=qStats.ok+qStats.ng+queue.length+(hasCard&&currentCard?1:0);
  const done=qStats.ok+qStats.ng;
  document.getElementById('q-bar').style.width=total?Math.round(done/total*100)+'%':'0%';
}

// ── Quiz mode toggle（単語テスト / 状況文で練習） ────────────────────────────
function initQuizTab() {
  switchQuizMode(LS.get('quizMode') || 'flashcard', true);
}
function switchQuizMode(mode, skipSave) {
  document.querySelectorAll('.quiz-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('quiz-flashcard-area').style.display   = mode === 'flashcard'   ? 'block' : 'none';
  document.getElementById('quiz-situational-area').style.display = mode === 'situational' ? 'block' : 'none';
  if (!skipSave) LS.set('quizMode', mode);
  if (mode === 'flashcard') startQuiz(); else startSituationalPractice();
}

// ── シチュエーション文練習（発話・タイピング両対応、SRSで出す単語を決定） ──
const SITUATIONAL_CTX = {
  micBtn: 'situational-mic-btn', result: 'situational-speech-result', text: 'situational-speech-text',
  onFinal: (transcript) => gradeSituationalAnswer(transcript),
};

const SITUATIONAL_SENTENCE_SCHEMA = {
  type: 'object',
  properties: {
    scenario_jp: { type: 'string' },
    target_words: { type: 'array', items: { type: 'string' } },
  },
  required: ['scenario_jp', 'target_words'],
};
const SITUATIONAL_GRADE_SCHEMA = {
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    used_target_words: { type: 'array', items: { type: 'string' } },
    corrected: { type: 'string' },
    feedback: { type: 'string' },
  },
  required: ['correct', 'used_target_words', 'corrected', 'feedback'],
};

function buildSituationalPrompt(words) {
  return `Create a short, natural Japanese sentence (1-2 sentences) describing an everyday situation, such that a natural English response would require using ${words.length > 1 ? 'these words' : 'this word'}: ${words.join(', ')}.
Return the scenario in "scenario_jp", and in "target_words" list which of the given words are actually required to answer naturally (normally all of them, but omit any that don't fit).`;
}
function buildSituationalGradePrompt(scenarioJp, targetWords, studentAnswer) {
  return `A Japanese English-learner was given this scenario and must respond in English using the target word(s):
Scenario (Japanese): "${scenarioJp}"
Target word(s) to use: ${targetWords.join(', ')}
Student's English answer: "${studentAnswer}"

Judge whether the answer is a natural, grammatically correct English response AND correctly uses the target word(s) (a natural inflection/synonym counts). Set "correct" true only if both hold reasonably well. List in "used_target_words" which target words were actually used correctly. Provide an improved version in "corrected" (repeat the student's answer if already good). Give one short, encouraging sentence of feedback in "feedback", written in ${t('feedback-lang')}.`;
}

let currentSituational = null;

async function startSituationalPractice() {
  const empty = document.getElementById('situational-empty'), area = document.getElementById('situational-area');
  const { data: vocab } = await sb.from('vocab').select('*');
  allVocab = vocab || [];
  if (!allVocab.length) { empty.style.display='block'; area.style.display='none'; return; }
  empty.style.display='none'; area.style.display='block';

  document.getElementById('situational-result').style.display = 'none';
  document.getElementById('situational-speech-result').style.display = 'none';
  document.getElementById('situational-answer').value = '';
  document.getElementById('situational-scenario').textContent = t('loading-situational');
  document.getElementById('situational-target-words').innerHTML = '';

  const words = await fetchDueVocab(2, allVocab);
  if (!words.length) { empty.style.display='block'; area.style.display='none'; return; }

  try {
    const res = await callGemini(buildSituationalPrompt(words.map(w => w.en)), SITUATIONAL_SENTENCE_SCHEMA);
    const data = JSON.parse(res);
    currentSituational = {
      scenarioJp: data.scenario_jp,
      targetWords: (data.target_words && data.target_words.length) ? data.target_words : words.map(w => w.en),
      vocabRows: words,
    };
    document.getElementById('situational-scenario').textContent = currentSituational.scenarioJp;
    document.getElementById('situational-target-words').innerHTML = currentSituational.targetWords
      .map(w => `<span class="word-hint-item">${escapeHtml(w)}</span>`).join('');
  } catch (e) {
    document.getElementById('situational-scenario').textContent = t('error-ai') + e.message;
  }
}

async function submitSituationalTyped() {
  const answer = document.getElementById('situational-answer').value.trim();
  if (answer) await gradeSituationalAnswer(answer);
}

async function gradeSituationalAnswer(answer) {
  if (!currentSituational || !answer) return;
  const resultBox = document.getElementById('situational-result');
  const banner = document.getElementById('situational-result-banner');
  resultBox.style.display = 'block';
  banner.className = 'result-banner';
  banner.textContent = t('loading-situational-grading');
  document.getElementById('situational-corrected').textContent = '';
  document.getElementById('situational-feedback').textContent = '';
  try {
    const res = await callGemini(
      buildSituationalGradePrompt(currentSituational.scenarioJp, currentSituational.targetWords, answer),
      SITUATIONAL_GRADE_SCHEMA
    );
    const data = JSON.parse(res);
    banner.className = 'result-banner ' + (data.correct ? 'result-ok' : 'result-ng');
    banner.textContent = data.correct ? t('situational-correct') : t('situational-incorrect');
    document.getElementById('situational-corrected').textContent = data.corrected || '';
    document.getElementById('situational-feedback').textContent  = data.feedback || '';
    await applySituationalSrsUpdate(data);
  } catch (e) {
    banner.className = 'result-banner result-ng';
    banner.textContent = t('error-ai') + e.message;
  }
}

async function applySituationalSrsUpdate(data) {
  const usedLower = (data.used_target_words || []).map(w => w.toLowerCase());
  for (const v of currentSituational.vocabRows) {
    const enLower = v.en.toLowerCase();
    const wasUsed = usedLower.some(w => w.includes(enLower) || enLower.includes(w));
    const srs = computeSrsUpdate(v, wasUsed);
    await sb.from('vocab').update({
      ...srs,
      correct: wasUsed ? (v.correct||0)+1 : (v.correct||0),
      wrong:   wasUsed ? (v.wrong||0)     : (v.wrong||0)+1,
    }).eq('id', v.id);
  }
}

// ── Gemini (Cloudflare Worker 経由) ─────────────────────────────────────────
async function callGemini(prompt, schema, timeoutMs = 20000) {
  const body = JSON.stringify({ prompt, schema });

  for (let attempt = 0; ; attempt++) {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(t('error-ai-timeout'));
      throw e;
    } finally {
      clearTimeout(timer);
    }
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
