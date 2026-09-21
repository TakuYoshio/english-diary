// ブラウザ抜きで検証できる純粋なロジックのテスト。
// app.js / progress.js はモジュールではなく1つのグローバルスコープを共有する
// スクリプトなので、ファイルを読んで隔離したコンテキストで評価し、関数を取り出す。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;

// app.js / progress.js は DOM や Supabase に触る関数も含むが、
// ここで呼ぶのは純粋な関数だけなので、最低限のスタブを置いて読み込む。
const sandbox = {
  console,
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    documentElement: {},
    body: { appendChild: () => {} },
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }),
  },
  window: { addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
  navigator: { userAgent: 'node' },
  location: { protocol: 'http:', hash: '', pathname: '/', search: '' },
  speechSynthesis: { cancel() {}, getVoices: () => [], speak() {} },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: async () => ({ ok: false }),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of ['app.js', 'progress.js']) {
  vm.runInContext(readFileSync(root + file, 'utf8'), sandbox, { filename: file });
}

// strictモードのスクリプトでは、トップレベルの const/let はグローバルオブジェクトの
// プロパティにならない（function や var はなる）。定数は式として評価して取り出す。
const get = (name) => vm.runInContext(name, sandbox);

// VM内で作られた配列・オブジェクトは別realmのプロトタイプを持つため
// deepStrictEqual が参照比較で落ちる。構造だけ比べたいのでJSONで往復させる。
const plain = (v) => JSON.parse(JSON.stringify(v));
const eq = (actual, expected, msg) => assert.deepEqual(plain(actual), expected, msg);

const {
  // Word Garden
  srsStageIcon, srsStageKey, isWeakWord, weakVocab, computeGardenCounts,
  // 日記から復習
  splitSentences, buildDiaryQuizPool,
  // 週報
  weekStartOf, previousWeekStart, weekDates, computeWeeklyReport,
} = sandbox;
const DQ_STOPWORDS = get('DQ_STOPWORDS');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── Word Garden ───────────────────────────────────────────────────────────
test('srsStageIcon が7段階を4つのアイコンに畳む', () => {
  eq([0, 1, 2, 3, 4, 5, 6].map(srsStageIcon),
    ['🌱', '🌱', '🌿', '🌿', '🌷', '🌷', '🌸']);
  eq([0, 1, 2, 3, 4, 5, 6].map(srsStageKey),
    ['seed', 'seed', 'sprout', 'sprout', 'bud', 'bud', 'bloom']);
});

test('srsStageIcon が範囲外の値でも壊れない', () => {
  assert.equal(srsStageIcon(undefined), '🌱');
  assert.equal(srsStageIcon(-5), '🌱');
  assert.equal(srsStageIcon(99), '🌸');
});

test('isWeakWord は wrong>=2 かつ 正答率<60% のときだけ真', () => {
  assert.equal(isWeakWord({ correct: 1, wrong: 2 }), true);   // 33%
  assert.equal(isWeakWord({ correct: 0, wrong: 2 }), true);   // 0%
  assert.equal(isWeakWord({ correct: 1, wrong: 1 }), false);  // wrong が2未満
  assert.equal(isWeakWord({ correct: 0, wrong: 0 }), false);  // 未テスト
  assert.equal(isWeakWord({ correct: 3, wrong: 2 }), false);  // 60%ちょうどは苦手ではない
  assert.equal(isWeakWord({ correct: 4, wrong: 2 }), false);  // 67%
});

test('正解を重ねると苦手から卒業する（列を足さずに成立する）', () => {
  const v = { correct: 1, wrong: 2 };
  assert.equal(isWeakWord(v), true);
  v.correct++; assert.equal(isWeakWord(v), true);   // 2/4 = 50%
  v.correct++; assert.equal(isWeakWord(v), false);  // 3/5 = 60% → 卒業
});

test('computeGardenCounts が段階ごとに数える', () => {
  const g = computeGardenCounts([
    { srs_stage: 0 }, { srs_stage: 1 }, { srs_stage: 2 },
    { srs_stage: 4 }, { srs_stage: 6 }, {},
  ]);
  eq(g, { seed: 3, sprout: 1, bud: 1, bloom: 1 });
  eq(computeGardenCounts([]), { seed: 0, sprout: 0, bud: 0, bloom: 0 });
});

test('weakVocab が苦手だけを返す', () => {
  const list = [{ en: 'a', correct: 0, wrong: 3 }, { en: 'b', correct: 9, wrong: 1 }];
  eq(weakVocab(list).map(v => v.en), ['a']);
});

// ── 日記から復習 ──────────────────────────────────────────────────────────
test('splitSentences が文末で分割する', () => {
  eq(splitSentences('I went to a cafe. It was nice! Did you go?'),
    ['I went to a cafe.', 'It was nice!', 'Did you go?']);
});

test('splitSentences は略語のピリオドで切らない', () => {
  // 誤って切ると意味の通らない断片が出題されてしまう
  eq(splitSentences('I met Mr. Tanaka today.'), ['I met Mr. Tanaka today.']);
  eq(splitSentences('I saw Dr. Smith. She was kind.'),
    ['I saw Dr. Smith.', 'She was kind.']);
  eq(splitSentences('We bought apples, bananas, etc. Then we went home.'),
    ['We bought apples, bananas, etc. Then we went home.']);
});

test('splitSentences が空入力で落ちない', () => {
  eq(splitSentences(''), []);
  eq(splitSentences(null), []);
});

test('buildDiaryQuizPool が短すぎる／長すぎる文を採用しない', () => {
  const pool = buildDiaryQuizPool([
    { id: 1, date: '2026-09-01', jp: '短い', corrected: 'I slept.' },                      // 2語 → 不採用
    { id: 2, date: '2026-09-02', jp: '普通', corrected: 'I went to a cafe with my friend.' }, // 8語 → 採用
  ], []);
  assert.ok(pool.length > 0, '採用された問題が無い');
  assert.ok(pool.every(q => q.words.length >= 5 && q.words.length <= 12));
  assert.ok(pool.every(q => q.entry.id === 2));
});

test('穴埋めの空所に機能語を選ばない', () => {
  const entries = [{ id: 1, date: '2026-09-02', jp: '', corrected: 'I went to a cafe with my friend.' }];
  for (let i = 0; i < 30; i++) {
    buildDiaryQuizPool(entries, []).filter(q => q.kind === 'cloze').forEach(q => {
      assert.ok(!DQ_STOPWORDS.has(q.answer.toLowerCase()),
        `機能語 "${q.answer}" が空所に選ばれた`);
      assert.ok(q.answer.length >= 3);
    });
  }
});

test('単語帳にある語が優先して空所になる', () => {
  const entries = [{ id: 1, date: '2026-09-02', jp: '', corrected: 'I went to a cafe with my friend.' }];
  const vocab = [{ id: 9, en: 'cafe', jp: 'カフェ', next_review_at: '2000-01-01T00:00:00Z' }];
  // 期限切れの単語帳語があれば必ずそれが選ばれる（優先度0）
  for (let i = 0; i < 20; i++) {
    buildDiaryQuizPool(entries, vocab).filter(q => q.kind === 'cloze').forEach(q => {
      assert.equal(q.answer.toLowerCase(), 'cafe');
      assert.equal(q.vocab?.id, 9);
    });
  }
});

test('buildDiaryQuizPool が空入力で落ちない', () => {
  eq(buildDiaryQuizPool([], []), []);
  eq(buildDiaryQuizPool(null, null), []);
});

// ── 週報の週境界 ──────────────────────────────────────────────────────────
test('weekStartOf が月曜を返す', () => {
  // 2026-09-21 は月曜
  assert.equal(weekStartOf('2026-09-21'), '2026-09-21'); // 月曜自身
  assert.equal(weekStartOf('2026-09-22'), '2026-09-21'); // 火曜
  assert.equal(weekStartOf('2026-09-27'), '2026-09-21'); // 日曜 → 同じ週
  assert.equal(weekStartOf('2026-09-28'), '2026-09-28'); // 次の月曜
});

test('日曜に週が閉じる（日曜は前の月曜の週）', () => {
  assert.equal(weekStartOf('2026-09-20'), '2026-09-14'); // 日曜
  assert.equal(weekDates('2026-09-14')[6], '2026-09-20');
});

test('previousWeekStart が1週間前の月曜を返す', () => {
  assert.equal(previousWeekStart('2026-09-21'), '2026-09-14');
  assert.equal(previousWeekStart('2026-09-27'), '2026-09-14');
});

test('週が月をまたいでも正しい', () => {
  // 2026-10-01 は木曜 → その週の月曜は 09-28
  assert.equal(weekStartOf('2026-10-01'), '2026-09-28');
  eq(weekDates('2026-09-28'),
    ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
});

test('年をまたいでも正しい', () => {
  // 2027-01-01 は金曜 → その週の月曜は 2026-12-28
  assert.equal(weekStartOf('2027-01-01'), '2026-12-28');
});

// ── 週報の集計 ────────────────────────────────────────────────────────────
const WEEK = '2026-09-14'; // 月曜、週末は 09-20
const sampleEntries = [
  { date: '2026-09-14', jp: '月曜', corrected: 'I started a new book today.', pronunciation_first_attempt: { score: 72 } },
  { date: '2026-09-15', jp: '火曜', corrected: 'I went to the gym after work and felt great.', pronunciation_first_attempt: { score: 91 } },
  { date: '2026-09-16', jp: '水曜', corrected: 'Short one.' },
  { date: '2026-09-21', jp: '週外', corrected: 'This belongs to the next week.', pronunciation_first_attempt: { score: 99 } },
];

test('集計が対象週の日記だけを見る', () => {
  const r = computeWeeklyReport(WEEK, { entries: sampleEntries, vocab: [] });
  assert.equal(r.entryCount, 3);
  assert.equal(r.daysWritten, 3);
  assert.equal(r.weekStart, '2026-09-14');
  assert.equal(r.weekEnd, '2026-09-20');
});

test('発音ベストは対象週の最高点（週外の99点を拾わない）', () => {
  const r = computeWeeklyReport(WEEK, { entries: sampleEntries, vocab: [] });
  assert.equal(r.bestPronunciation, 91);
});

test('発音スコアが1件も無ければ null', () => {
  const r = computeWeeklyReport(WEEK, {
    entries: [{ date: '2026-09-15', corrected: 'No score here at all.' }], vocab: [],
  });
  assert.equal(r.bestPronunciation, null);
});

test('新しい単語は作成日時が週内のものだけ数える', () => {
  const vocab = [
    { created_at: '2026-09-14T00:30:00Z' },  // 週内
    { created_at: '2026-09-20T23:30:00Z' },  // 週内（日曜の終わり）
    { created_at: '2026-09-13T23:00:00Z' },  // 週の前
    { created_at: '2026-09-21T01:00:00Z' },  // 週の後
  ];
  assert.equal(computeWeeklyReport(WEEK, { entries: [], vocab }).newWords, 2);
});

test('ハイライトは週内の最も長い文', () => {
  const r = computeWeeklyReport(WEEK, { entries: sampleEntries, vocab: [] });
  assert.equal(r.highlight.sentence, 'I went to the gym after work and felt great.');
  assert.equal(r.highlight.date, '2026-09-15');
});

test('連続して書けた日数を数える', () => {
  const r = computeWeeklyReport(WEEK, { entries: sampleEntries, vocab: [] });
  assert.equal(r.bestRun, 3); // 14,15,16 の3日連続
});

test('応援メッセージが日数で出し分けられる', () => {
  const mk = dates => dates.map(d => ({ date: d, corrected: 'A sentence for the day.' }));
  assert.equal(computeWeeklyReport(WEEK, { entries: mk(['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18']) }).tone, 'great');
  assert.equal(computeWeeklyReport(WEEK, { entries: mk(['2026-09-14','2026-09-15']) }).tone, 'good');
  assert.equal(computeWeeklyReport(WEEK, { entries: mk(['2026-09-14']) }).tone, 'comeback');
});

test('データが無い週でも落ちない', () => {
  const r = computeWeeklyReport(WEEK, {});
  assert.equal(r.entryCount, 0);
  assert.equal(r.daysWritten, 0);
  assert.equal(r.newWords, 0);
  assert.equal(r.bestPronunciation, null);
  assert.equal(r.highlight, null);
  assert.equal(r.bestRun, 0);
  assert.equal(r.tone, 'comeback');
});

// ── 実行 ──────────────────────────────────────────────────────────────────
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
console.log(`\nユニット: ${tests.length} 件すべて通過`);
