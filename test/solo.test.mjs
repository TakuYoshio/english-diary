// SoloMic のテスト。実ブラウザ抜きで、偽の SpeechRecognition を注入して
// 「再開をまたいでも文字が重複・欠落しないこと」を中心に検証する。
// ここが壊れると、利用者は30分話した内容を静かに失う。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;

// ── 偽の SpeechRecognition ────────────────────────────────────────────────
// 実物と同じく「再開するたびに results のインデックスが0に戻る」挙動を再現する。
class FakeRecognition {
  constructor() {
    FakeRecognition.instances.push(this);
    this.started = false;
    this.onresult = this.onerror = this.onend = null;
  }
  start() {
    if (this.started) throw new Error('InvalidStateError');
    this.started = true;
    FakeRecognition.startCount++;
  }
  stop() { this.started = false; }

  // このインスタンスに認識結果を流す（毎回 resultIndex=0 から始まる）
  emit(items) {
    const results = items.map(([text, isFinal, conf]) => {
      const alt = { transcript: text, confidence: conf ?? 0.9 };
      const r = [alt]; r.isFinal = isFinal; r.length = 1;
      return r;
    });
    results.length = items.length;
    this.onresult?.({ resultIndex: 0, results });
  }
  fail(error) { this.onerror?.({ error }); }
  end() { this.started = false; this.onend?.(); }
}
FakeRecognition.instances = [];
FakeRecognition.startCount = 0;
FakeRecognition.reset = () => { FakeRecognition.instances = []; FakeRecognition.startCount = 0; };

// ── solo.js を隔離コンテキストで読み込む ──────────────────────────────────
const timers = [];
const sandbox = {
  console,
  SpeechRecognition: FakeRecognition,
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  document: {},
  // タイマーは手動で進めたいので溜め込む
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(root + 'solo.js', 'utf8'), sandbox, { filename: 'solo.js' });

const get = (name) => vm.runInContext(name, sandbox);
const plain = (v) => JSON.parse(JSON.stringify(v));
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

const createSoloMic = sandbox.createSoloMic;
const { soloCountWords, soloCountFillers, soloWpm, soloJoinSegments, soloTruncateTranscript } = sandbox;
const SOLO_DEAD_AFTER_FAILURES = get('SOLO_DEAD_AFTER_FAILURES');

// 溜まったタイマーを全部発火させる（バックオフを進める）
function flushTimers(rounds = 1) {
  for (let i = 0; i < rounds; i++) {
    const pending = timers.splice(0, timers.length);
    pending.forEach(t => t.fn && t.fn());
  }
}
const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── 発話の集計 ────────────────────────────────────────────────────────────
test('soloCountWords が語数を数える', () => {
  assert.equal(soloCountWords("I went to a cafe and it's nice"), 8);
  assert.equal(soloCountWords(''), 0);
  assert.equal(soloCountWords(null), 0);
});

test('soloCountFillers が filler を数える', () => {
  assert.equal(soloCountFillers('um I went uh to the store you know'), 3);
  assert.equal(soloCountFillers('I went to the store'), 0);
});

test('soloWpm は短すぎる区間では0を返す', () => {
  assert.equal(soloWpm(100, 60000), 100);
  assert.equal(soloWpm(10, 1000), 0);  // 0.1分未満はノイズなので出さない
});

test('soloTruncateTranscript が長すぎる文字起こしの中央を落とす', () => {
  const long = 'a'.repeat(200);
  const out = soloTruncateTranscript(long, 100);
  assert.ok(out.length < long.length);
  assert.ok(out.includes('中略'));
  assert.ok(out.startsWith('a'), '先頭は残す');
  assert.ok(out.endsWith('a'), '末尾は残す');
  // 上限以下ならそのまま
  assert.equal(soloTruncateTranscript('short', 100), 'short');
});

// ── SoloMic 本体 ──────────────────────────────────────────────────────────
test('確定した発話だけを蓄積し、途中経過は混ぜない', () => {
  FakeRecognition.reset();
  const interims = [];
  const mic = createSoloMic({ onInterim: x => interims.push(x) });
  mic.start();
  latest().emit([['I went to a cafe', false]]);
  eq(mic.segments, [], '未確定は蓄積しない');
  assert.equal(interims[interims.length - 1], 'I went to a cafe');

  latest().emit([['I went to a cafe today', true]]);
  assert.equal(mic.segments.length, 1);
  assert.equal(mic.transcript(), 'I went to a cafe today');
  mic.stop();
});

test('再開をまたいでも文字が重複しない（resultIndex方式）', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  latest().emit([['First sentence', true]]);

  // 認識が勝手に終了 → 自動再開
  latest().end();
  flushTimers();
  assert.ok(FakeRecognition.startCount >= 2, '自動再開していない');

  // 新しいインスタンスは results が0から始まる
  latest().emit([['Second sentence', true]]);
  assert.equal(mic.transcript(), 'First sentence Second sentence',
    '再開後に前の文が重複または欠落している');
  mic.stop();
});

test('複数の確定結果が同時に来ても全部拾う', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  latest().emit([['One', true], ['Two', true], ['Three', false]]);
  assert.equal(mic.transcript(), 'One Two');
  assert.equal(mic.interim, 'Three');
  mic.stop();
});

test('無言で終了しても自動再開し、状態を reconnecting にする', () => {
  FakeRecognition.reset();
  const states = [];
  const mic = createSoloMic({ onStateChange: s => states.push(s) });
  mic.start();
  assert.equal(mic.state, 'running');
  latest().fail('no-speech');
  latest().end();
  assert.equal(mic.state, 'reconnecting');
  flushTimers();
  assert.equal(mic.state, 'running');
  mic.stop();
});

test('権限が無い場合は再開せず dead になる', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  const before = FakeRecognition.startCount;
  latest().fail('not-allowed');
  assert.equal(mic.state, 'dead');
  flushTimers(3);
  assert.equal(FakeRecognition.startCount, before, '再開してはいけない');
});

test('再開しても結果が出ないと needs-tap に落ちる（iOSの無言失敗対策）', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  // 結果を一度も返さないまま終了し続ける
  for (let i = 0; i < SOLO_DEAD_AFTER_FAILURES + 1; i++) {
    if (latest()) latest().end();
    flushTimers();
  }
  assert.equal(mic.state, 'needs-tap',
    `${SOLO_DEAD_AFTER_FAILURES}回失敗しても自動再開を続けている`);
});

test('needs-tap から resume() で復帰でき、以降も蓄積が続く', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  latest().emit([['Before the drop', true]]);
  for (let i = 0; i < SOLO_DEAD_AFTER_FAILURES + 1; i++) {
    if (latest()) latest().end();
    flushTimers();
  }
  assert.equal(mic.state, 'needs-tap');

  mic.resume();
  assert.equal(mic.state, 'running');
  latest().emit([['After the tap', true]]);
  assert.equal(mic.transcript(), 'Before the drop After the tap',
    '復帰前の内容が失われている');
  mic.stop();
});

test('pause 中は自動再開しない', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  mic.pause();
  assert.equal(mic.state, 'paused');
  const before = FakeRecognition.startCount;
  flushTimers(3);
  assert.equal(FakeRecognition.startCount, before);
});

test('start() が例外を投げてもバックオフしてやり直す', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  // 同じインスタンスで二重 start すると InvalidStateError
  const inst = latest();
  inst.started = true;
  inst.end();            // onend → scheduleRestart
  flushTimers();         // 新インスタンスで再開
  assert.notEqual(mic.state, 'dead');
  mic.stop();
});

test('タイピング入力も同じバッファに積まれ、input_method が mixed になる', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.start();
  latest().emit([['I spoke this', true]]);
  mic.addTyped('I typed this');
  assert.equal(mic.transcript(), 'I spoke this I typed this');
  assert.equal(mic.inputMethod(), 'mixed');
  mic.stop();
});

test('空のタイピング入力は無視する', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.addTyped('   ');
  eq(mic.segments, []);
});

test('SpeechRecognition非対応でも落ちず dead を返す', () => {
  const saved = sandbox.SpeechRecognition;
  sandbox.SpeechRecognition = undefined;
  sandbox.webkitSpeechRecognition = undefined;
  const mic = vm.runInContext('createSoloMic({})', sandbox);
  assert.equal(mic.supported, false);
  assert.equal(mic.start(), false);
  assert.equal(mic.state, 'dead');
  sandbox.SpeechRecognition = saved;
});

test('復帰データを読み込める（誤リロードからの復活）', () => {
  FakeRecognition.reset();
  const mic = createSoloMic();
  mic.restore([{ t: 0, text: 'Saved from before', conf: 0.9, source: 'speech' }]);
  mic.start();
  latest().emit([['And now this', true]]);
  assert.equal(mic.transcript(), 'Saved from before And now this');
  mic.stop();
});

test('soloJoinSegments が空や空白だけの断片を落とす', () => {
  assert.equal(soloJoinSegments([{ text: 'a' }, { text: '  ' }, { text: 'b' }]), 'a b');
  assert.equal(soloJoinSegments([]), '');
  assert.equal(soloJoinSegments(null), '');
});

// ── 実行 ──────────────────────────────────────────────────────────────────
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
console.log(`\nSoloMic: ${tests.length} 件すべて通過`);
