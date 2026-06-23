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

// ── Supabase ──────────────────────────────────────────────────────────────
let sb = null;
function initSB() {
  const c = cfg();
  if (c.sbUrl && c.sbKey) sb = supabase.createClient(c.sbUrl, c.sbKey);
}

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
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
  if (!gemini || !sbUrl || !sbKey) { alert('すべて入力してください'); return; }
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
  if (!jp) { alert('日本語で今日の出来事を書いてね'); return; }
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
    <input type="text" class="input word-jp" placeholder="日本語の単語" />
    <span class="arrow">→</span>
    <input type="text" class="input word-en" placeholder="英語（後で調べる）" />
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

  // Collect word pairs and show as chips
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
  if (!en2) { alert('2回目の英訳を書いてね'); return; }

  unlock('step5-card');
  const correctedEl = document.getElementById('ai-corrected-text');
  const feedbackEl  = document.getElementById('ai-feedback-text');
  correctedEl.innerHTML = '<span class="loading-text">AIが添削中…</span>';
  feedbackEl.innerHTML  = '<span class="loading-text">フィードバック生成中…</span>';

  const jp  = document.getElementById('diary-jp').value.trim();
  const en1 = document.getElementById('diary-en1').value.trim();

  const words = [];
  document.querySelectorAll('.word-row').forEach(row => {
    const wj = row.querySelector('.word-jp').value.trim();
    const we = row.querySelector('.word-en').value.trim();
    if (wj && we) words.push(`${wj} → ${we}`);
  });

  const prompt = `You are a native English teacher helping a Japanese learner.

Japanese diary entry: "${jp}"

Student's 1st English attempt: "${en1}"
Vocabulary the student looked up: ${words.length ? words.join(', ') : '(none)'}
Student's 2nd English attempt (improved): "${en2}"

Please respond in exactly this format:

CORRECTED:
[Write the most natural native English version of the diary entry here. Keep the same meaning and personal tone.]

FEEDBACK:
[In Japanese: Give encouraging, specific feedback. Mention 2 things done well and 1-2 improvements from 1st to 2nd attempt. Max 80 words.]`;

  try {
    const res = await callGemini(prompt);
    const correctedMatch = res.match(/CORRECTED:\s*([\s\S]*?)(?=FEEDBACK:|$)/);
    const feedbackMatch  = res.match(/FEEDBACK:\s*([\s\S]*)/);
    const corrected = correctedMatch ? correctedMatch[1].trim() : en2;
    const feedback  = feedbackMatch  ? feedbackMatch[1].trim()  : '';
    correctedEl.textContent = corrected;
    feedbackEl.textContent  = feedback;

    // Save corrected text for step 6
    window._correctedText = corrected;
  } catch (e) {
    correctedEl.textContent = en2 + '\n\n(AI添削エラー: ' + e.message + ')';
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
    if (btn) { btn.textContent = '🔊 もう一度再生'; btn.disabled = false; }
  };
  if (btn) { btn.textContent = '🔊 再生中…'; btn.disabled = false; }
  speechSynthesis.speak(utter);
}

function speakCorrected() {
  const text = document.getElementById('ai-corrected-text').textContent;
  if (!text || text.includes('添削中')) return;
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
  // Auto-play for shadowing reference
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
  if (!SR) { alert('このブラウザは音声認識に対応していません。ChromeかSafariをお使いください。'); return; }

  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  const btn = document.getElementById('mic-btn');
  btn.classList.add('recording');
  document.querySelector('.mic-label').textContent = '認識中…';
  isRecording = true;

  document.getElementById('speech-result').style.display = 'none';

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('speech-text').textContent = transcript;
    document.getElementById('speech-result').style.display = 'block';

    if (e.results[0].isFinal) {
      scorePronunciation(transcript);
    }
  };

  recognition.onerror = (e) => {
    stopMic();
    if (e.error !== 'no-speech') alert('音声認識エラー: ' + e.error);
  };

  recognition.onend = () => stopMic();
  recognition.start();
}

function stopMic() {
  if (recognition) { recognition.stop(); recognition = null; }
  isRecording = false;
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording');
  document.querySelector('.mic-label').textContent = 'タップして話す';
}

function scorePronunciation(spoken) {
  const target = document.getElementById('target-sentence').textContent.toLowerCase().trim();
  const spokenLower = spoken.toLowerCase().trim();

  // Tokenize and compare
  const targetWords = target.replace(/[^\w\s]/g, '').split(/\s+/);
  const spokenWords = spokenLower.replace(/[^\w\s]/g, '').split(/\s+/);
  const matchCount  = targetWords.filter(w => spokenWords.includes(w)).length;
  const score       = targetWords.length ? Math.round(matchCount / targetWords.length * 100) : 0;

  const scoreEl = document.getElementById('speech-score');
  if (score >= 80) {
    scoreEl.className = 'speech-score score-great';
    scoreEl.textContent = `🎉 すごい！ ${score}% 一致 — ネイティブに近い発音です`;
  } else if (score >= 50) {
    scoreEl.className = 'speech-score score-ok';
    scoreEl.textContent = `👍 ${score}% 一致 — もう一度練習してみよう`;
  } else {
    scoreEl.className = 'speech-score score-try';
    scoreEl.textContent = `💪 ${score}% 一致 — ゆっくり音声を聞いてから再挑戦！`;
  }
}

// ── Save Diary ────────────────────────────────────────────────────────────
async function saveDiary() {
  const jp        = document.getElementById('diary-jp').value.trim();
  const en1       = document.getElementById('diary-en1').value.trim();
  const en2       = document.getElementById('diary-en2').value.trim();
  const corrected = window._correctedText || '';
  if (!jp) { alert('日記を書いてから保存してね'); return; }

  // Collect unknown words to vocab
  const newWords = [];
  document.querySelectorAll('.word-row').forEach(row => {
    const wordJp = row.querySelector('.word-jp').value.trim();
    const wordEn = row.querySelector('.word-en').value.trim();
    if (wordJp && wordEn) newWords.push({ jp: wordJp, en: wordEn });
  });

  // Save entry
  const { error } = await sb.from('entries').insert({
    date: todayISO(), jp, en1, en2, corrected,
  });
  if (error) { alert('保存エラー: ' + error.message); return; }

  // Add new words to vocab (skip duplicates)
  if (newWords.length) {
    const { data: existing } = await sb.from('vocab').select('en');
    const existingSet = new Set((existing||[]).map(v => v.en.toLowerCase()));
    const toAdd = newWords.filter(w => !existingSet.has(w.en.toLowerCase()));
    if (toAdd.length) {
      await sb.from('vocab').insert(toAdd.map(w => ({ ...w, note: '', correct: 0, wrong: 0 })));
    }
  }

  // Reset
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
  showToast(`日記を保存しました！${newWords.length ? `${newWords.length}件の単語を単語帳に追加。` : ''}`);
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
  if (!en || !jp) { alert('英語と日本語を入力してね'); return; }
  const { error } = await sb.from('vocab').insert({ en, jp, note, correct: 0, wrong: 0 });
  if (error) { alert('エラー: ' + error.message); return; }
  document.getElementById('v-en').value = '';
  document.getElementById('v-jp').value = '';
  document.getElementById('v-note').value = '';
  await renderVocab();
}
async function deleteVocab(id) {
  if (!confirm('この単語を削除しますか？')) return;
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
  count.textContent   = `${vocab.length}件`;
  list.innerHTML = vocab.map(v => {
    const total = (v.correct||0) + (v.wrong||0);
    const rate  = total ? Math.round(v.correct/total*100) : null;
    const cls   = rate===null ? 'rate-new' : rate>=70 ? 'rate-ok' : 'rate-ng';
    return `<div class="vocab-row">
      <div class="v-en">${v.en}</div>
      <div class="v-jp">${v.jp}</div>
      <div class="v-note">${v.note||''}</div>
      <span class="v-rate ${cls}">${rate===null?'未テスト':rate+'%'}</span>
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
  document.getElementById('hint-btn').textContent='ヒントを見る';
  document.getElementById('quiz-input').disabled=false;
  document.getElementById('quiz-input').value='';
  if (!queue.length) {
    const total=qStats.ok+qStats.ng;
    document.getElementById('quiz-word').textContent='🎉 完了！';
    document.getElementById('quiz-dir').textContent=total?`正解率 ${Math.round(qStats.ok/total*100)}%`:'';
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
  document.getElementById('quiz-dir').textContent  = dir==='en2jp'?'英語 → 日本語':'日本語 → 英語';
  document.getElementById('quiz-word').textContent = dir==='en2jp'?v.en:v.jp;
  document.getElementById('hint-text').textContent = v.note||'（メモなし）';
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
    qStats.ok++; banner.className='result-banner result-ok'; banner.textContent=`✓ 正解！「${correct}」`;
    await sb.from('vocab').update({correct:(v.correct||0)+1}).eq('id',v.id);
  } else {
    qStats.ng++; banner.className='result-banner result-ng'; banner.textContent=`✗ 不正解。正解は「${correct}」`;
    await sb.from('vocab').update({wrong:(v.wrong||0)+1}).eq('id',v.id);
  }
  input.disabled=true; updateQStats(true); setTimeout(nextQ,1600);
}
function skipQ() { if(currentCard){queue.push(currentCard);nextQ();} }
function toggleHint() {
  const el=document.getElementById('hint-text'),btn=document.getElementById('hint-btn');
  const vis=el.style.display!=='none';
  el.style.display=vis?'none':'block'; btn.textContent=vis?'ヒントを見る':'ヒントを隠す';
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
