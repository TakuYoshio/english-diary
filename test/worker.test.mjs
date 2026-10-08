// Cloudflare Workerの検証ロジックのテスト。
// wranglerを動かさずに済むよう、fetchとKVをスタブしてモジュールを直接呼ぶ。
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const ORIGIN = 'https://takuyoshio.github.io';
let geminiCalls = [];
let searchCalls = [];
let downloadCalls = [];
let unsplashStatus = 200;
let authOk = true;

// Unsplashの応答（余計なキーも混ぜて、Worker側が落とすことを確かめる）
const unsplashBody = () => ({
  total: 3,
  results: [
    { id: 'aaa', likes: 12,
      urls: { thumb: 'https://images.unsplash.com/1?w=200', small: 'https://images.unsplash.com/1?w=400', raw: 'https://images.unsplash.com/1' },
      links: { html: 'https://unsplash.com/photos/aaa', download_location: 'https://api.unsplash.com/photos/aaa/download?ixid=xyz' },
      user: { name: 'Jane Doe', username: 'jane', links: { html: 'https://unsplash.com/@jane' } } },
    { id: 'bbb',
      urls: { thumb: 'https://images.unsplash.com/2?w=200', small: 'https://images.unsplash.com/2?w=400' },
      links: { html: 'https://unsplash.com/photos/bbb', download_location: 'https://evil.example/steal' },
      user: { username: 'roe', links: { html: 'http://unsplash.com/@roe' } } },
    // urlsが足りない候補は落とされるべき
    { id: 'ccc', urls: {}, links: {}, user: { name: 'Broken' } },
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
  if (u.includes('api.unsplash.com/search/photos')) {
    searchCalls.push(u);
    return new Response(JSON.stringify(unsplashBody()), { status: unsplashStatus });
  }
  if (u.includes('api.unsplash.com') && u.includes('/download')) {
    downloadCalls.push(u);
    return new Response('{}', { status: 200 });
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
  UNSPLASH_ACCESS_KEY: 'unsplash-key',
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

// ── 写真検索（Unsplash中継） ──────────────────────────────────────────────

test('写真検索は表示とクレジットに必要なものだけ返す', async () => {
  searchCalls = [];
  const res = await post({ action: 'photo', words: ['grateful'] });
  assert.equal(res.status, 200);
  const { photos } = await res.json();
  assert.equal(photos.grateful.length, 2, 'urlsが足りない候補は落とす');
  assert.deepEqual(Object.keys(photos.grateful[0]).sort(),
    ['download', 'large', 'name', 'page', 'small', 'source']);
  assert.equal(photos.grateful[0].name, 'Jane Doe');
  assert.equal(photos.grateful[0].small, 'https://images.unsplash.com/1?w=200');
  assert.equal(photos.grateful[0].large, 'https://images.unsplash.com/1?w=400');
  assert.equal(photos.grateful[0].source, 'unsplash');
});

test('撮影者リンクにUTMが付く（Unsplashの規約）', async () => {
  const res = await post({ action: 'photo', words: ['grateful'] });
  const { photos } = await res.json();
  assert.equal(photos.grateful[0].page,
    'https://unsplash.com/@jane?utm_source=english-diary&utm_medium=referral');
});

test('撮影者名が無ければユーザー名で代替する', async () => {
  const res = await post({ action: 'photo', words: ['grateful'] });
  const { photos } = await res.json();
  assert.equal(photos.grateful[1].name, 'roe');
});

test('httpsでないプロフィールURLは空にする', async () => {
  const res = await post({ action: 'photo', words: ['grateful'] });
  const { photos } = await res.json();
  assert.equal(photos.grateful[1].page, '', 'http:// のリンクを通してはいけない');
});

test('api.unsplash.com 以外のdownload_locationは捨てる', async () => {
  const res = await post({ action: 'photo', words: ['grateful'] });
  const { photos } = await res.json();
  assert.equal(photos.grateful[1].download, '', '外部URLを使用通知先にしてはいけない');
  assert.equal(photos.grateful[0].download, 'https://api.unsplash.com/photos/aaa/download?ixid=xyz');
});

test('検索リクエストにClient-IDとsquarishが乗る', async () => {
  searchCalls = [];
  await post({ action: 'photo', words: ['grateful'] });
  assert.match(searchCalls[0], /query=grateful/);
  assert.match(searchCalls[0], /orientation=squarish/);
  assert.match(searchCalls[0], /per_page=5/);
});

// ── 写真の使用通知（Unsplashの規約） ──────────────────────────────────────

test('使用通知はdownload_locationを叩く', async () => {
  downloadCalls = [];
  const res = await post({ action: 'photo_used',
    downloads: ['https://api.unsplash.com/photos/aaa/download?ixid=xyz'] });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).notified, 1);
  assert.equal(downloadCalls.length, 1);
});

test('使用通知はapi.unsplash.com以外を叩かない（SSRFの防止）', async () => {
  downloadCalls = [];
  const res = await post({ action: 'photo_used', downloads: [
    'https://evil.example/photos/x/download',
    'http://api.unsplash.com/photos/x/download',
    'https://api.unsplash.com/photos/x/download/../../admin',
    'https://api.unsplash.com/users/x',
    'not a url',
  ] });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).notified, 0);
  assert.equal(downloadCalls.length, 0);
});

test('使用通知もAIの1日80回を消費しない', async () => {
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  await post({ action: 'photo_used', downloads: ['https://api.unsplash.com/photos/aaa/download'] }, { env });
  assert.equal(env.RATE_LIMIT.store.get(`rl:user-1:${today}`), undefined);
  assert.equal(env.RATE_LIMIT.store.get(`rlp:user-1:${today}`), '1');
});

test('使用通知の件数が多すぎると400', async () => {
  const res = await post({ action: 'photo_used',
    downloads: Array.from({ length: 21 }, (_, i) => `https://api.unsplash.com/photos/p${i}/download`) });
  assert.equal(res.status, 400);
});

test('キー未設定なら使用通知は外に出ない', async () => {
  const env = baseEnv();
  delete env.UNSPLASH_ACCESS_KEY;
  downloadCalls = [];
  const res = await post({ action: 'photo_used', downloads: ['https://api.unsplash.com/photos/aaa/download'] }, { env });
  assert.equal(res.status, 200);
  assert.equal(downloadCalls.length, 0);
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

test('2回目はKVから返りUnsplashを叩かない', async () => {
  const env = baseEnv();
  searchCalls = [];
  await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(searchCalls.length, 1);
  await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(searchCalls.length, 1, '同じ語で2回目もUnsplashを叩いている');
});

test('0件だった語はKVの空配列から返し、Unsplashを叩き直さない', async () => {
  const env = baseEnv();
  await env.RATE_LIMIT.put('ph:nosuchword', '[]');
  searchCalls = [];
  const res = await post({ action: 'photo', words: ['nosuchword'] }, { env });
  const { photos } = await res.json();
  assert.deepEqual(photos.nosuchword, []);
  assert.equal(searchCalls.length, 0);
});

test('英単語以外の語は捨てる（検索プロキシにしない）', async () => {
  searchCalls = [];
  const res = await post({ action: 'photo', words: ['感謝', 'https://evil.example/x', '', 'a'.repeat(41), 'grateful'] });
  const { photos } = await res.json();
  assert.deepEqual(Object.keys(photos), ['grateful']);
  assert.equal(searchCalls.length, 1);
});

test('同じ語を重ねても1回しか引かない', async () => {
  const env = baseEnv();
  searchCalls = [];
  await post({ action: 'photo', words: ['grateful', 'Grateful', ' grateful '] }, { env });
  assert.equal(searchCalls.length, 1);
});

test('語数が多すぎると400', async () => {
  const res = await post({ action: 'photo', words: Array.from({ length: 21 }, (_, i) => `w${i}x`) });
  assert.equal(res.status, 400);
});

test('UNSPLASH_ACCESS_KEY未設定でも200で空を返す', async () => {
  const env = baseEnv();
  delete env.UNSPLASH_ACCESS_KEY;
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).photos, {});
});

test('Unsplashが失敗してもその語を落とすだけで200', async () => {
  const env = baseEnv();
  unsplashStatus = 500;
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  unsplashStatus = 200;
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
