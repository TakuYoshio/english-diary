// Cloudflare Workerの検証ロジックのテスト。
// wranglerを動かさずに済むよう、fetchとKVをスタブしてモジュールを直接呼ぶ。
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const ORIGIN = 'https://takuyoshio.github.io';
let geminiCalls = [];
let pexelsCalls = [];
let pexelsStatus = 200;
let authOk = true;

// Pexelsの応答（余計なキーも混ぜて、Worker側が落とすことを確かめる）
const pexelsBody = () => ({
  photos: [
    { id: 1, photographer: 'Jane Doe', photographer_id: 9, url: 'https://www.pexels.com/photo/1/',
      src: { tiny: 'https://images.pexels.com/photos/1/t.jpg', medium: 'https://images.pexels.com/photos/1/m.jpg', original: 'https://images.pexels.com/photos/1/o.jpg' } },
    { id: 2, photographer: 'John Roe', url: 'https://www.pexels.com/photo/2/',
      src: { tiny: 'https://images.pexels.com/photos/2/t.jpg', medium: 'https://images.pexels.com/photos/2/m.jpg' } },
    // srcが足りない候補は落とされるべき
    { id: 3, photographer: 'Broken', url: 'https://www.pexels.com/photo/3/', src: {} },
  ],
});

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/auth/v1/user')) {
    return authOk
      ? new Response(JSON.stringify({ id: 'user-1', email: 'a@b.c' }), { status: 200 })
      : new Response('no', { status: 401 });
  }
  if (u.includes('api.pexels.com')) {
    pexelsCalls.push(u);
    return new Response(JSON.stringify(pexelsBody()), { status: pexelsStatus });
  }
  if (u.includes('generativelanguage')) {
    geminiCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { status: 200 });
  }
  return realFetch(url, init);
};

function makeKV() {
  const store = new Map();
  return {
    store,
    get: async k => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); },
  };
}

const baseEnv = () => ({
  ALLOWED_ORIGIN: ORIGIN,
  SUPABASE_URL: 'https://sb.example.com',
  SUPABASE_ANON_KEY: 'anon',
  GEMINI_API_KEY: 'key',
  PEXELS_API_KEY: 'pexels-key',
  RATE_LIMIT: makeKV(),
});

const post = (body, { env = baseEnv(), headers = {}, auth = 'Bearer t' } = {}) =>
  worker.fetch(new Request('https://w.example.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Authorization: auth, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('CORSに Vary: Origin と Max-Age が付く', async () => {
  const res = await worker.fetch(new Request('https://w/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), baseEnv());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Vary'), 'Origin');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.ok(res.headers.get('Access-Control-Max-Age'));
});

test('許可されていないオリジンにはAllow-Originを返さない', async () => {
  const res = await worker.fetch(new Request('https://w/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), baseEnv());
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('未認証は401', async () => {
  authOk = false;
  const res = await post({ prompt: 'hi' });
  authOk = true;
  assert.equal(res.status, 401);
});

test('従来の {prompt} 形式がそのまま動く', async () => {
  geminiCalls = [];
  const res = await post({ prompt: 'hello' });
  assert.equal(res.status, 200);
  assert.deepEqual(geminiCalls[0].contents, [{ role: 'user', parts: [{ text: 'hello' }] }]);
});

test('maxOutputTokensが1024固定ではなくなっている', async () => {
  geminiCalls = [];
  await post({ prompt: 'hello' });
  assert.ok(geminiCalls[0].generationConfig.maxOutputTokens > 1024,
    `既定値が ${geminiCalls[0].generationConfig.maxOutputTokens} のまま`);
});

test('maxOutputTokensは上限でクランプされる', async () => {
  geminiCalls = [];
  await post({ prompt: 'x', maxOutputTokens: 99999 });
  assert.equal(geminiCalls[0].generationConfig.maxOutputTokens, 4096);
});

test('マルチターンの contents を受け付ける', async () => {
  geminiCalls = [];
  const res = await post({ contents: [
    { role: 'user', parts: [{ text: 'hi' }] },
    { role: 'model', parts: [{ text: 'hello!' }] },
    { role: 'user', parts: [{ text: 'how are you' }] },
  ] });
  assert.equal(res.status, 200);
  assert.equal(geminiCalls[0].contents.length, 3);
  assert.equal(geminiCalls[0].contents[1].role, 'model');
});

test('text以外のパートは拒否する（APIキー悪用の防止）', async () => {
  const res = await post({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }] });
  assert.equal(res.status, 400);
});

test('systemInstructionを渡せる', async () => {
  geminiCalls = [];
  await post({ prompt: 'x', system: 'You are a cat.' });
  assert.deepEqual(geminiCalls[0].systemInstruction, { parts: [{ text: 'You are a cat.' }] });
});

test('長すぎるプロンプトは413', async () => {
  const res = await post({ prompt: 'a'.repeat(60001) });
  assert.equal(res.status, 413);
});

test('Content-Typeがjson以外は415', async () => {
  const res = await post({ prompt: 'x' }, { headers: { 'Content-Type': 'text/plain' } });
  assert.equal(res.status, 415);
});

test('1分あたりのバースト上限を超えると403', async () => {
  const env = baseEnv();
  let last;
  for (let i = 0; i < 12; i++) last = await post({ prompt: 'x' }, { env });
  assert.equal(last.status, 403, '上限超過は403（429だとクライアントが再試行してしまう）');
  const body = await last.json();
  assert.equal(body.error.code, 'BURST_LIMIT');
});

test('1日の上限を超えると403', async () => {
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  env.RATE_LIMIT.store.set(`rl:user-1:${today}`, '80');
  const res = await post({ prompt: 'x' }, { env });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'DAILY_LIMIT');
});

test('KV未バインドでも動く（制限なしで素通し）', async () => {
  const env = baseEnv();
  delete env.RATE_LIMIT;
  const res = await post({ prompt: 'x' }, { env });
  assert.equal(res.status, 200);
});

// ── 写真検索（Pexels中継） ────────────────────────────────────────────────

test('写真検索は表示とクレジットに必要な4つだけ返す', async () => {
  pexelsCalls = [];
  const res = await post({ action: 'photo', words: ['grateful'] });
  assert.equal(res.status, 200);
  const { photos } = await res.json();
  assert.equal(photos.grateful.length, 2, 'srcが足りない候補は落とす');
  assert.deepEqual(Object.keys(photos.grateful[0]).sort(), ['large', 'name', 'page', 'small']);
  assert.equal(photos.grateful[0].name, 'Jane Doe');
  assert.equal(photos.grateful[0].small, 'https://images.pexels.com/photos/1/t.jpg');
});

test('写真検索はAIの1日80回を消費しない', async () => {
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(env.RATE_LIMIT.store.get(`rl:user-1:${today}`), undefined,
    'AI用のカウンタ(rl:)が増えている');
  assert.equal(env.RATE_LIMIT.store.get(`rlp:user-1:${today}`), '1');
});

test('AIの1日上限に達していても写真は引ける', async () => {
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  env.RATE_LIMIT.store.set(`rl:user-1:${today}`, '80');
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(res.status, 200);
});

test('写真にも専用の1日上限がある', async () => {
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  env.RATE_LIMIT.store.set(`rlp:user-1:${today}`, '200');
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'DAILY_LIMIT');
});

test('2回目はKVから返りPexelsを叩かない', async () => {
  const env = baseEnv();
  pexelsCalls = [];
  await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(pexelsCalls.length, 1);
  await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(pexelsCalls.length, 1, '同じ語で2回目もPexelsを叩いている');
});

test('0件だった語はKVの空配列から返し、Pexelsを叩き直さない', async () => {
  const env = baseEnv();
  await env.RATE_LIMIT.put('ph:nosuchword', '[]');
  pexelsCalls = [];
  const res = await post({ action: 'photo', words: ['nosuchword'] }, { env });
  const { photos } = await res.json();
  assert.deepEqual(photos.nosuchword, []);
  assert.equal(pexelsCalls.length, 0);
});

test('英単語以外の語は捨てる（検索プロキシにしない）', async () => {
  pexelsCalls = [];
  const res = await post({ action: 'photo', words: ['感謝', 'https://evil.example/x', '', 'a'.repeat(41), 'grateful'] });
  const { photos } = await res.json();
  assert.deepEqual(Object.keys(photos), ['grateful']);
  assert.equal(pexelsCalls.length, 1);
});

test('同じ語を重ねても1回しか引かない', async () => {
  const env = baseEnv();
  pexelsCalls = [];
  await post({ action: 'photo', words: ['grateful', 'Grateful', ' grateful '] }, { env });
  assert.equal(pexelsCalls.length, 1);
});

test('語数が多すぎると400', async () => {
  const res = await post({ action: 'photo', words: Array.from({ length: 21 }, (_, i) => `w${i}x`) });
  assert.equal(res.status, 400);
});

test('PEXELS_API_KEY未設定でも200で空を返す', async () => {
  const env = baseEnv();
  delete env.PEXELS_API_KEY;
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).photos, {});
});

test('Pexelsが失敗してもその語を落とすだけで200', async () => {
  const env = baseEnv();
  pexelsStatus = 500;
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  pexelsStatus = 200;
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).photos, {});
});

test('写真検索も未認証なら401', async () => {
  authOk = false;
  const res = await post({ action: 'photo', words: ['grateful'] });
  authOk = true;
  assert.equal(res.status, 401);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
console.log(`\nWorker: ${tests.length} 件すべて通過`);
