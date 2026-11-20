// Cloudflare Workerの検証ロジックのテスト。
// wranglerを動かさずに済むよう、fetchとKVをスタブしてモジュールを直接呼ぶ。
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const ORIGIN = 'https://takuyoshio.github.io';
let geminiCalls = [];
let iconCalls = [];
let iconStatus = 200;
let geminiReply = '{}';
let authOk = true;

// Iconifyの応答。実物と同じ形にしてある（実機で確認済み）。
// 素の検索は同じ絵の変種を大量に返すので、Worker側で絞れることを確かめる。
const COLLECTIONS = {
  ph:                 { name: 'Phosphor',          palette: false, license: { title: 'MIT', spdx: 'MIT', url: 'https://github.com/phosphor-icons/core/blob/main/LICENSE' } },
  'material-symbols': { name: 'Material Symbols',  palette: false, license: { title: 'Apache 2.0', spdx: 'Apache-2.0', url: 'https://example.com/apache' } },
  tabler:             { name: 'Tabler Icons',      palette: false, license: { title: 'MIT', spdx: 'MIT', url: 'https://example.com/tabler' } },
  'icon-park':        { name: 'IconPark',          palette: true,  license: { title: 'Apache 2.0', spdx: 'Apache-2.0', url: 'https://example.com/iconpark' } },
  iconmind:           { name: 'IconMind',          palette: false, license: { title: 'Proprietary', spdx: 'LicenseRef-Commercial', url: 'https://example.com/iconmind' } },
};

let iconResults = {};   // query -> ["prefix:name", ...]

function iconBody(query) {
  const icons = iconResults[query] || [];
  const collections = {};
  for (const full of icons) {
    const prefix = full.slice(0, full.indexOf(':'));
    if (COLLECTIONS[prefix]) collections[prefix] = COLLECTIONS[prefix];
  }
  return { icons, total: icons.length, limit: 64, start: 0, collections, request: { query } };
}

// fetchのスタブ。Supabaseの認証・Gemini・Iconify だけを受け止め、
// それ以外は本物に通す（テストでは外には出ない）。
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/auth/v1/user')) {
    return authOk
      ? new Response(JSON.stringify({ id: 'user-1', email: 'a@b.c' }), { status: 200 })
      : new Response('no', { status: 401 });
  }
  if (u.includes('api.iconify.design/search')) {
    const q = decodeURIComponent(new URL(u).searchParams.get('query') || '');
    iconCalls.push(q);
    return new Response(JSON.stringify(iconBody(q)), { status: iconStatus });
  }
  if (u.includes('generativelanguage')) {
    geminiCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiReply }] } }] }), { status: 200 });
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

// ── アイコン検索（Iconify中継） ────────────────────────────────────────────

function resetIcons() {
  iconCalls = [];
  iconStatus = 200;
  iconResults = {
    // 実機の commute と同じ形: 同じ絵の変種だらけ
    commute: [
      'material-symbols:commute', 'material-symbols:commute-outline',
      'material-symbols:commute-rounded', 'tabler:commute', 'ph:commute',
      'icon-park:commute-color', 'iconmind:commute-duotone-bold',
    ],
    // 名前の一致度の検証用: 完全一致が後ろに置いてある
    deadline: ['iconmind:enrol-deadline-duotone-bold', 'tabler:deadline-sort', 'ph:deadline'],
    hesitate: ['ph:hand-palm', 'tabler:hesitate'],
    grateful: [],
    reluctant: [],
  };
}

test('アイコン検索は表示とライセンス表示に必要なものだけ返す', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['commute'] });
  assert.equal(res.status, 200);
  const { photos } = await res.json();
  assert.deepEqual(Object.keys(photos.commute[0]).sort(),
    ['icon', 'license', 'page', 'set', 'source']);
  assert.equal(photos.commute[0].source, 'iconify');
});

test('セットの優先順位で見た目を揃える（Phosphorが先頭）', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['commute'] });
  const { photos } = await res.json();
  assert.equal(photos.commute[0].icon, 'ph:commute', JSON.stringify(photos.commute));
  assert.equal(photos.commute[0].set, 'Phosphor');
});

test('カラーのセットは捨てる（1色に揃えられないため）', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['commute'] });
  const { photos } = await res.json();
  assert.ok(!photos.commute.some(c => c.icon.startsWith('icon-park:')),
    'palette=true のセットを通してはいけない');
});

test('ライセンスが分からないセットは捨てる', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['commute'] });
  const { photos } = await res.json();
  assert.ok(!photos.commute.some(c => c.icon.startsWith('iconmind:')));
});

test('候補は同じセットを重ねない（別のアイコンにするで違う絵が出る）', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['commute'] });
  const { photos } = await res.json();
  const prefixes = photos.commute.map(c => c.icon.split(':')[0]);
  assert.equal(new Set(prefixes).size, prefixes.length, JSON.stringify(prefixes));
});

test('名前が完全一致する候補を優先する', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['deadline'] });
  const { photos } = await res.json();
  assert.equal(photos.deadline[0].icon, 'ph:deadline', JSON.stringify(photos.deadline));
});

test('0件の語はAIに言い換えてもらってから引き直す', async () => {
  resetIcons();
  geminiCalls = [];
  geminiReply = JSON.stringify({ keywords: ['hesitate'] });
  const res = await post({ action: 'photo', words: ['reluctant'] });
  const { photos } = await res.json();
  assert.equal(geminiCalls.length, 1, 'AIに言い換えを頼んでいない');
  assert.deepEqual(iconCalls, ['reluctant', 'hesitate']);
  assert.equal(photos.reluctant[0].icon, 'ph:hand-palm', JSON.stringify(photos.reluctant));
  geminiReply = '{}';
});

test('素の検索で当たる語にはAIを使わない', async () => {
  resetIcons();
  geminiCalls = [];
  await post({ action: 'photo', words: ['commute'] });
  assert.equal(geminiCalls.length, 0);
});

test('言い換えても見つからなければ空で返す（落ちない）', async () => {
  resetIcons();
  geminiReply = JSON.stringify({ keywords: ['nothingmatches'] });
  const res = await post({ action: 'photo', words: ['grateful'] });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).photos, { grateful: [] });
  geminiReply = '{}';
});

test('アイコン検索はAIの1日80回を消費しない', async () => {
  resetIcons();
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  await post({ action: 'photo', words: ['commute'] }, { env });
  assert.equal(env.RATE_LIMIT.store.get(`rl:user-1:${today}`), undefined,
    'AI用のカウンタ(rl:)が増えている');
  assert.equal(env.RATE_LIMIT.store.get(`rlp:user-1:${today}`), '1');
});

test('AIの1日上限に達していてもアイコンは引ける', async () => {
  resetIcons();
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  env.RATE_LIMIT.store.set(`rl:user-1:${today}`, '80');
  assert.equal((await post({ action: 'photo', words: ['commute'] }, { env })).status, 200);
});

test('アイコンにも専用の1日上限がある', async () => {
  resetIcons();
  const env = baseEnv();
  const today = new Date().toISOString().slice(0, 10);
  env.RATE_LIMIT.store.set(`rlp:user-1:${today}`, '200');
  const res = await post({ action: 'photo', words: ['commute'] }, { env });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'DAILY_LIMIT');
});

test('2回目はKVから返りIconifyを叩かない', async () => {
  resetIcons();
  const env = baseEnv();
  await post({ action: 'photo', words: ['commute'] }, { env });
  assert.equal(iconCalls.length, 1);
  await post({ action: 'photo', words: ['commute'] }, { env });
  assert.equal(iconCalls.length, 1, '同じ語で2回目もIconifyを叩いている');
});

test('0件だった語もKVに覚えてAIを呼び直さない', async () => {
  resetIcons();
  const env = baseEnv();
  await env.RATE_LIMIT.put('ph:grateful', '[]');
  geminiCalls = [];
  const res = await post({ action: 'photo', words: ['grateful'] }, { env });
  assert.deepEqual((await res.json()).photos.grateful, []);
  assert.equal(iconCalls.length, 0);
  assert.equal(geminiCalls.length, 0);
});

test('英単語以外の語は捨てる（検索プロキシにしない）', async () => {
  resetIcons();
  const res = await post({ action: 'photo', words: ['感謝', 'https://evil.example/x', '', 'a'.repeat(41), 'commute'] });
  const { photos } = await res.json();
  assert.deepEqual(Object.keys(photos), ['commute']);
  assert.equal(iconCalls.length, 1);
});

test('同じ語を重ねても1回しか引かない', async () => {
  resetIcons();
  await post({ action: 'photo', words: ['commute', 'Commute', ' commute '] }, { env: baseEnv() });
  assert.equal(iconCalls.length, 1);
});

test('語数が多すぎると400', async () => {
  const res = await post({ action: 'photo', words: Array.from({ length: 21 }, (_, i) => `w${i}x`) });
  assert.equal(res.status, 400);
});

test('Iconifyが失敗してもその語を落とすだけで200（キャッシュもしない）', async () => {
  resetIcons();
  const env = baseEnv();
  iconStatus = 500;
  const res = await post({ action: 'photo', words: ['commute'] }, { env });
  iconStatus = 200;
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).photos, {});
  assert.equal(env.RATE_LIMIT.store.get('ph:commute'), undefined, '失敗をキャッシュしてはいけない');
});

test('アイコン検索も未認証なら401', async () => {
  authOk = false;
  const res = await post({ action: 'photo', words: ['commute'] });
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
