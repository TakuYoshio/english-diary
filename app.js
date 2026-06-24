'use strict';

// ── Config ────────────────────────────────────────────────────────────────
const LS = { get: k => localStorage.getItem(k), set: (k,v) => localStorage.setItem(k,v) };
function cfg() {
  return {
    gemini: LS.get('gemini_key') || '',
    sbUrl:  LS.get('sb_url') || '',
    sbKey:  LS.get('sb_key') || '',
  };
}

// ── i18n ──────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  ja: {
    'setup-title': '英語日記', 'setup-sub': 'APIキーを設定してください',
    'label-gemini': 'Gemini API Key', 'badge-free': '無料',
    'hint-gemini': 'で取得（無料）', 'btn-start': '始める →',
    'hint-keys': 'キーはこのブラウザにのみ保存されます',
    'app-title': '英語日記', 'nav-diary': '日記', 'nav-vocab': '単語帳', 'nav-quiz': 'テスト',
    'step1-title': '日本語で今日の出来事を書く',
    'step2-title': '自分で英訳してみる（1回目）',
    'step3-title': 'わからない単語を控えておく',
    'step3-hint': '英訳できなかった・自信がない単語をメモしておこう',
    'step4-title': '調べた上で再英訳（2回目）',
    'step5-title': 'AIが添削', 'step6-title': '音声入力で発音チェック',
    'ph-diary-jp': '今日は...', 'ph-word-jp': '日本語の単語', 'ph-word-en': '英語（後で調べる）',
    'btn-next': '次へ →', 'btn-step4-next': '調べたら次へ →',
    'btn-ai': 'AIに添削してもらう →', 'btn-shadow': 'シャドーイングできたら次へ →',
    'btn-save-diary': '💾 日記を保存', 'btn-add-word': '＋ 追加',
    'btn-tts': '🔊 音声を再生', 'tts-hint': '再生したらシャドーイングしてみよう',
    'btn-hear-target': '🔊 もう一度聞く',
    'ai-corrected-label': '✨ 添削後の英文', 'ai-feedback-label': '📝 フィードバック',
    'target-label': '目標文', 'mic-label': 'タップして話す',
    'speech-recognized': '認識された文', 'entries-title': '過去の日記',
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
    'modal-hear': '🔊 もう一度聞く',
    // Dynamic
    'alert-write-jp': '日本語で今日の出来事を書いてね',
    'alert-write-en2': '2回目の英訳を書いてね',
    'alert-write-before-save': '日記を書いてから保存してね',
    'alert-vocab-fill': '英語と日本語を入力してね',
    'alert-no-speech': 'このブラウザは音声認識に対応していません。ChromeかSafariをお使いください。',
    'loading-correcting': 'AIが添削中…', 'loading-feedback': 'フィードバック生成中…',
    'error-ai': 'AI添削エラー: ', 'error-save': '保存エラー: ', 'error-vocab': 'エラー: ',
    'toast-saved': '日記を保存しました！', 'toast-words-added': '件の単語を単語帳に追加。',
    'vocab-untested': '未テスト',
    'quiz-complete': '🎉 完了！', 'quiz-rate': '正解率 ',
    'quiz-correct': '✓ 正解！「', 'quiz-wrong': '✗ 不正解。正解は「',
    'quiz-dir-en2jp': '英語 → 日本語', 'quiz-dir-jp2en': '日本語 → 英語',
    'mic-listening': '認識中…', 'btn-tts-playing': '🔊 再生中…', 'btn-tts-replay': '🔊 もう一度再生',
    'score-great': '🎉 すごい！ {score}% 一致 — ネイティブに近い発音です',
    'score-ok': '👍 {score}% 一致 — もう一度練習してみよう',
    'score-try': '💪 {score}% 一致 — ゆっくり音声を聞いてから再挑戦！',
    'feedback-lang': '日本語',
  },
  en: {
    'setup-title': 'English Diary', 'setup-sub': 'Please enter your API keys',
    'label-gemini': 'Gemini API Key', 'badge-free': 'Free',
    'hint-gemini': '— Get it free', 'btn-start': 'Get Started →',
    'hint-keys': 'Keys are stored only in this browser',
    'app-title': 'English Diary', 'nav-diary': 'Diary', 'nav-vocab': 'Vocabulary', 'nav-quiz': 'Quiz',
    'step1-title': 'Write today\'s diary in your native language',
    'step2-title': 'Try translating it into English (1st attempt)',
    'step3-title': 'Note down words you didn\'t know',
    'step3-hint': 'Write down words you couldn\'t translate or weren\'t sure about',
    'step4-title': 'Look them up and re-translate (2nd attempt)',
    'step5-title': 'AI Correction', 'step6-title': 'Pronunciation Check',
    'ph-diary-jp': 'Write in your native language...', 'ph-word-jp': 'Word in your language', 'ph-word-en': 'English (look it up)',
    'btn-next': 'Next →', 'btn-step4-next': 'Next after looking up →',
    'btn-ai': 'Get AI Correction →', 'btn-shadow': 'Next after shadowing →',
    'btn-save-diary': '💾 Save Diary', 'btn-add-word': '+ Add',
    'btn-tts': '🔊 Play Audio', 'tts-hint': 'Try shadowing after listening',
    'btn-hear-target': '🔊 Listen again',
    'ai-corrected-label': '✨ Corrected English', 'ai-feedback-label': '📝 Feedback',
    'target-label': 'Target sentence', 'mic-label': 'Tap to speak',
    'speech-recognized': 'Recognized speech', 'entries-title': 'Past Entries',
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
    'modal-hear': '🔊 Listen again',
    // Dynamic
    'alert-write-jp': 'Please write today\'s diary entry first',
    'alert-write-en2': 'Please write your 2nd translation first',
    'alert-write-before-save': 'Please write your diary before saving',
    'alert-vocab-fill': 'Please fill in both English and translation',
    'alert-no-speech': 'Speech recognition is not supported. Please use Chrome or Safari.',
    'loading-correcting': 'AI is correcting…', 'loading-feedback': 'Generating feedback…',
    'error-ai': 'AI correction error: ', 'error-save': 'Save error: ', 'error-vocab': 'Error: ',
    'toast-saved': 'Diary saved!', 'toast-words-added': ' words added to vocabulary.',
    'vocab-untested': 'New',
    'quiz-complete': '🎉 Done!', 'quiz-rate': 'Score: ',
    'quiz-correct': '✓ Correct! "', 'quiz-wrong': '✗ Wrong. Answer: "',
    'quiz-dir-en2jp': 'English → Translation', 'quiz-dir-jp2en': 'Translation → English',
    'mic-listening': 'Listening…', 'btn-tts-playing': '🔊 Playing…', 'btn-tts-replay': '🔊 Play again',
    'score-great': '🎉 Excellent! {score}% match — Near-native pronunciation!',
    'score-ok': '👍 {score}% match — Keep practicing!',
    'score-try': '💪 {score}% match — Listen again and try once more!',
    'feedback-lang': 'English',
  }
};

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
  const c = cfg();
  if (c.sbUrl && c.sbKey) sb = supabase.createClient(c.sbUrl, c.sbKey);
}

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  applyLang();
  const c = cfg();
  if (!c.gemini || !c.sbUrl || !c.sbKey) {
    document.getElementById('setup-screen').style.display = 'flex';
    return;
  }
  initSB();
  document.getElementById('app').style.display = 'block';
  setDateLabel();
  addWordRow();
  await Promise.all([loadEntries(), renderVocab()]);
  startQuiz();
});

// ── Setup / Settings ──────────────────────────────────────────────────────
function saveSetup() {
  const gemini = document.getElementById('s-gemini').value.trim();
  const sbUrl  = document.getElementById('s-sb-url').value.trim();
  const sbKey  = document.getElementById('s-sb-key').value.trim();
  if (!gemini || !sbUrl || !sbKey) { alert(t('alert-write-jp')); return; }
  LS.set('gemini_key', gemini);
  LS.set('sb_url', sbUrl); LS.set('sb_key', sbKey);
  location.reload();
}
function openSettings() {
  const c = cfg();
  document.getElementById('cfg-gemini').value = c.gemini;
  document.getElementById('cfg-sb-url').value = c.sbUrl;
  document.getElementById('cfg-sb-key').value = c.sbKey;
  document.getElementById('settings-modal').style.display = 'flex';
}
function updateSettings() {
  LS.set('gemini_key', document.getElementById('cfg-gemini').value.trim());
  LS.set('sb_url',     document.getElementById('cfg-sb-url').value.trim());
  LS.set('sb_key',     document.getElementById('cfg-sb-key').value.trim());
  closeModal('settings-modal'); location.reload();
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  if (name === 'vocab') renderVocab();
  if (name === 'quiz')  startQuiz();
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
function addWordRow() {
  const row = document.createElement('div');
  row.className = 'word-row';
  row.innerHTML = `
    <input type="text" class="input word-jp" placeholder="${t('ph-word-jp')}" />
    <span class="arrow">→</span>
    <input type="text" class="input word-en" placeholder="${t('ph-word-en')}" />
    <button class="icon-btn red" onclick="removeWordRow(this)">✕</button>
  `;
  document.getElementById('unknown-words-list').appendChild(row);
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
async function goStep5() {
  const en2 = document.getElementById('diary-en2').value.trim();
  if (!en2) { alert(t('alert-write-en2')); return; }

  unlock('step5-card');
  const correctedEl = document.getElementById('ai-corrected-text');
  const feedbackEl  = document.getElementById('ai-feedback-text');
  correctedEl.innerHTML = `<span class="loading-text">${t('loading-correcting')}</span>`;
  feedbackEl.innerHTML  = `<span class="loading-text">${t('loading-feedback')}</span>`;

  const jp  = document.getElementById('diary-jp').value.trim();
  const en1 = document.getElementById('diary-en1').value.trim();

  const words = [];
  document.querySelectorAll('.word-row').forEach(row => {
    const wj = row.querySelector('.word-jp').value.trim();
    const we = row.querySelector('.word-en').value.trim();
    if (wj && we) words.push(`${wj} → ${we}`);
  });

  const feedbackLang = t('feedback-lang');
  const prompt = `You are a native English teacher helping a language learner.

Original diary entry: "${jp}"

Student's 1st English attempt: "${en1}"
Vocabulary the student looked up: ${words.length ? words.join(', ') : '(none)'}
Student's 2nd English attempt (improved): "${en2}"

Please respond in exactly this format:

CORRECTED:
[Write the most natural native English version of the diary entry here. Keep the same meaning and personal tone.]

FEEDBACK:
[In ${feedbackLang}: Give encouraging, specific feedback. Mention 2 things done well and 1-2 improvements from 1st to 2nd attempt. Max 80 words.]`;

  try {
    const res = await callGemini(prompt);
    const correctedMatch = res.match(/CORRECTED:\s*([\s\S]*?)(?=FEEDBACK:|$)/);
    const feedbackMatch  = res.match(/FEEDBACK:\s*([\s\S]*)/);
    const corrected = correctedMatch ? correctedMatch[1].trim() : en2;
    const feedback  = feedbackMatch  ? feedbackMatch[1].trim()  : '';
    correctedEl.textContent = corrected;
    feedbackEl.textContent  = feedback;
    window._correctedText = corrected;
  } catch (e) {
    correctedEl.textContent = en2 + '\n\n(' + t('error-ai') + e.message + ')';
    feedbackEl.textContent  = '';
    window._correctedText   = en2;
  }
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

// ── Web Speech API (Step 6) ───────────────────────────────────────────────
let recognition = null;
let isRecording = false;

function toggleMic() {
  if (isRecording) { stopMic(); return; }
  startMic();
}

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert(t('alert-no-speech')); return; }

  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  const btn = document.getElementById('mic-btn');
  btn.classList.add('recording');
  document.querySelector('.mic-label').textContent = t('mic-listening');
  isRecording = true;

  document.getElementById('speech-result').style.display = 'none';

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('speech-text').textContent = transcript;
    document.getElementById('speech-result').style.display = 'block';
    if (e.results[0].isFinal) scorePronunciation(transcript);
  };

  recognition.onerror = (e) => {
    stopMic();
    if (e.error !== 'no-speech') alert('Error: ' + e.error);
  };

  recognition.onend = () => stopMic();
  recognition.start();
}

function stopMic() {
  if (recognition) { recognition.stop(); recognition = null; }
  isRecording = false;
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording');
  document.querySelector('.mic-label').textContent = t('mic-label');
}

function scorePronunciation(spoken) {
  const target = document.getElementById('target-sentence').textContent.toLowerCase().trim();
  const spokenLower = spoken.toLowerCase().trim();
  const targetWords = target.replace(/[^\w\s]/g, '').split(/\s+/);
  const spokenWords = spokenLower.replace(/[^\w\s]/g, '').split(/\s+/);
  const matchCount  = targetWords.filter(w => spokenWords.includes(w)).length;
  const score       = targetWords.length ? Math.round(matchCount / targetWords.length * 100) : 0;

  const scoreEl = document.getElementById('speech-score');
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
    const wordJp = row.querySelector('.word-jp').value.trim();
    const wordEn = row.querySelector('.word-en').value.trim();
    if (wordJp && wordEn) newWords.push({ jp: wordJp, en: wordEn });
  });

  const { error } = await sb.from('entries').insert({
    date: todayISO(), jp, en1, en2, corrected,
  });
  if (error) { alert(t('error-save') + error.message); return; }

  if (newWords.length) {
    const { data: existing } = await sb.from('vocab').select('en');
    const existingSet = new Set((existing||[]).map(v => v.en.toLowerCase()));
    const toAdd = newWords.filter(w => !existingSet.has(w.en.toLowerCase()));
    if (toAdd.length) {
      await sb.from('vocab').insert(toAdd.map(w => ({ ...w, note: '', correct: 0, wrong: 0 })));
    }
  }

  document.getElementById('diary-jp').value  = '';
  document.getElementById('diary-en1').value = '';
  document.getElementById('diary-en2').value = '';
  document.getElementById('unknown-words-list').innerHTML = '';
  addWordRow();
  window._correctedText = '';
  ['step2-card','step3-card','step4-card','step5-card','step6-card'].forEach(id => lock(id));
  document.getElementById('speech-result').style.display = 'none';
  document.getElementById('ai-corrected-text').textContent = '';
  document.getElementById('ai-feedback-text').textContent  = '';
  document.getElementById('target-sentence').textContent   = '';

  await loadEntries();
  const wordsMsg = newWords.length ? `${newWords.length}${t('toast-words-added')}` : '';
  showToast(t('toast-saved') + (wordsMsg ? ' ' + wordsMsg : ''));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Past Entries ──────────────────────────────────────────────────────────
async function loadEntries() {
  const { data } = await sb.from('entries').select('*').order('date', { ascending: false }).limit(50);
  const section = document.getElementById('entries-section');
  const list    = document.getElementById('entries-list');
  if (!data || !data.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = data.map(e => `
    <div class="entry-card" onclick="viewEntry(${e.id})">
      <div class="entry-date">${fmtDate(e.date)}</div>
      <div class="entry-preview">${e.jp}</div>
    </div>
  `).join('');
}

async function viewEntry(id) {
  const { data } = await sb.from('entries').select('*').eq('id', id).single();
  if (!data) return;
  document.getElementById('modal-date').textContent      = fmtDate(data.date);
  document.getElementById('modal-jp').textContent        = data.jp || '—';
  document.getElementById('modal-en1').textContent       = data.en1 || '—';
  document.getElementById('modal-en2').textContent       = data.en2 || '—';
  document.getElementById('modal-corrected').textContent = data.corrected || '—';
  _modalCorrectedText = data.corrected || '';
  document.getElementById('entry-modal').style.display = 'flex';
}

// ── Vocab ─────────────────────────────────────────────────────────────────
async function addVocab() {
  const en   = document.getElementById('v-en').value.trim();
  const jp   = document.getElementById('v-jp').value.trim();
  const note = document.getElementById('v-note').value.trim();
  if (!en || !jp) { alert(t('alert-vocab-fill')); return; }
  const { error } = await sb.from('vocab').insert({ en, jp, note, correct: 0, wrong: 0 });
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
async function renderVocab() {
  const { data: vocab } = await sb.from('vocab').select('*').order('created_at', { ascending: false });
  const list  = document.getElementById('vocab-list');
  const empty = document.getElementById('vocab-empty');
  const count = document.getElementById('vocab-count');
  if (!vocab || !vocab.length) { list.innerHTML=''; empty.style.display='block'; count.textContent=''; return; }
  empty.style.display = 'none';
  count.textContent   = `${vocab.length}`;
  list.innerHTML = vocab.map(v => {
    const total = (v.correct||0) + (v.wrong||0);
    const rate  = total ? Math.round(v.correct/total*100) : null;
    const cls   = rate===null ? 'rate-new' : rate>=70 ? 'rate-ok' : 'rate-ng';
    return `<div class="vocab-row">
      <div class="v-en">${v.en}</div>
      <div class="v-jp">${v.jp}</div>
      <div class="v-note">${v.note||''}</div>
      <span class="v-rate ${cls}">${rate===null ? t('vocab-untested') : rate+'%'}</span>
      <button class="icon-btn red" onclick="deleteVocab(${v.id})">✕</button>
    </div>`;
  }).join('');
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
async function checkAnswer() {
  const input=document.getElementById('quiz-input');
  const ans=input.value.trim().toLowerCase();
  if (!ans||!currentCard) return;
  const {v,dir}=currentCard;
  const correct=dir==='en2jp'?v.jp:v.en;
  const isOk=ans===correct.toLowerCase()||(ans.length>3&&correct.toLowerCase().includes(ans));
  const banner=document.getElementById('result-banner');
  banner.style.display='block';
  if (isOk) {
    qStats.ok++; banner.className='result-banner result-ok';
    banner.textContent=t('quiz-correct')+correct+'」';
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

// ── Gemini ────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const key = cfg().gemini;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
