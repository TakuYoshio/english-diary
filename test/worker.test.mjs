// Cloudflare Workerの検証ロジックのテスト。
// wranglerを動かさずに済むよう、fetchとKVをスタブしてモジュールを直接呼ぶ。
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const ORIGIN = 'https://takuyoshio.github.io';
let geminiCalls = [];
let authOk = true;

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/auth/v1/user')) {
    return authOk
      ? new Response(JSON.stringify({ id: 'user-1', email: 'a@b.c' }), { status: 200 })
      : new Response('no', { status: 401 });
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

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
if (failed) { console.error(`\n${failed} 件失敗`); process.exit(1); }
console.log(`\nWorker: ${tests.length} 件すべて通過`);
