'use strict';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const UNSPLASH_URL = 'https://api.unsplash.com/search/photos';
// 利用規約で、撮影者とUnsplashへのリンクにUTMを付けることが求められている。
const UNSPLASH_UTM = 'utm_source=english-diary&utm_medium=referral';

// ── 上限値 ────────────────────────────────────────────────────────────────
// 1リクエストあたり
const MAX_BODY_BYTES = 200 * 1024;  // 本文サイズ
const MAX_TEXT_CHARS = 60000;       // プロンプト（全ターン合計）の文字数
const MAX_TURNS = 40;               // マルチターン会話の往復数
const MAX_OUTPUT_TOKENS_CAP = 4096;
const DEFAULT_OUTPUT_TOKENS = 2048;

// 1ユーザーあたり（Gemini無料枠を1人で使い切れないようにする）
const DAILY_LIMIT = 80;
const BURST_LIMIT = 10;             // 直近1分あたり

// 写真検索（Unsplash の Demo モードは50リクエスト/時）。
// 語ごとにKVへ長期キャッシュするので、同じ語で外に出るのは1回だけ。
const MAX_PHOTO_WORDS = 20;         // 1リクエストで引ける語数
const PHOTO_CANDIDATES = 5;         // 1語あたりの候補数
const PHOTO_CACHE_TTL = 30 * 86400; // KVに置く期間（秒）
const PHOTO_DAILY_LIMIT = 200;
const PHOTO_BURST_LIMIT = 40;       // 検索1回＋使用通知20件が同じ分に入りうる
const PHOTO_ACTIONS = new Set(['photo', 'photo_used']);

// レート制限のカウンタはAI用と写真用で分ける。写真検索はAIではないので、
// Geminiを守るための1日80回を食わせてはいけない。
const AI_LIMITS    = { day: 'rl',  min: 'rlm',  daily: DAILY_LIMIT,       burst: BURST_LIMIT };
const PHOTO_LIMITS = { day: 'rlp', min: 'rlpm', daily: PHOTO_DAILY_LIMIT, burst: PHOTO_BURST_LIMIT };

function corsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    // オリジンごとに応答が変わるため。これが無いと中間キャッシュが
    // 別オリジン宛にAllow-Originヘッダを配ってしまう恐れがある。
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function allowedOriginList(env) {
  return String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function fail(message, status, cors, extra) {
  return json({ error: { message, ...extra } }, status, cors);
}

// 認証済みユーザーを返す（失敗時はnull）。
// 以前はres.okだけを見てレスポンス本文を捨てていたため、ユーザーごとの
// 利用回数を数えるキーが取れなかった。同じ往復でidまで取り出す。
async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  try {
    const user = await res.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

// ── レート制限（Workers KV） ──────────────────────────────────────────────
// KVは結果整合なので厳密なカウントにはならないが、「1人が無料枠を
// 使い切るのを防ぐ」用途には十分。RATE_LIMITがバインドされていない場合は
// 制限なしで動作する（ローカル検証や移行中に止まらないようにするため）。
async function checkRateLimit(env, userId, limits = AI_LIMITS) {
  if (!env.RATE_LIMIT) return { ok: true };

  const now = new Date();
  const dayKey = `${limits.day}:${userId}:${now.toISOString().slice(0, 10)}`;
  const minKey = `${limits.min}:${userId}:${Math.floor(now.getTime() / 60000)}`;

  const [dayRaw, minRaw] = await Promise.all([
    env.RATE_LIMIT.get(dayKey),
    env.RATE_LIMIT.get(minKey),
  ]);
  const day = Number(dayRaw) || 0;
  const min = Number(minRaw) || 0;

  if (day >= limits.daily) return { ok: false, reason: 'DAILY_LIMIT', limit: limits.daily };
  if (min >= limits.burst) return { ok: false, reason: 'BURST_LIMIT', limit: limits.burst };

  await Promise.all([
    env.RATE_LIMIT.put(dayKey, String(day + 1), { expirationTtl: 172800 }),
    env.RATE_LIMIT.put(minKey, String(min + 1), { expirationTtl: 120 }),
  ]);
  return { ok: true, used: day + 1, limit: limits.daily };
}

// ── 写真検索（Unsplash） ──────────────────────────────────────────────────
// 単語カードの画像は、以前は生成AIに描かせていたが抽象語で絵にならず、
// 行ごとに生成を頼むので遅かった。既にある写真を検索して使う。
// APIキーをブラウザに置けないのでここで中継する。

// 英単語以外は弾く。Workerを任意の画像検索プロキシにしないため。
function normalizePhotoWord(raw) {
  if (typeof raw !== 'string') return '';
  const w = raw.trim().toLowerCase();
  if (!w || w.length > 40) return '';
  if (!/^[a-z][a-z0-9 '-]*$/.test(w)) return '';
  return w;
}

const httpsOnly = (v) => (typeof v === 'string' && v.startsWith('https://') ? v : '');

function withUtm(url) {
  if (!url) return '';
  return url + (url.includes('?') ? '&' : '?') + UNSPLASH_UTM;
}

// 「写真を使った」通知のURL。クライアントを経由して戻ってくるので、
// api.unsplash.com の download エンドポイントだけに厳しく限る。
// 任意のURLをWorkerから叩かせてはいけない。
function unsplashDownloadUrl(raw) {
  if (typeof raw !== 'string') return '';
  let u;
  try { u = new URL(raw); } catch { return ''; }
  if (u.protocol !== 'https:' || u.hostname !== 'api.unsplash.com') return '';
  if (!/^\/photos\/[\w-]+\/download$/.test(u.pathname)) return '';
  return u.toString();
}

function unsplashHeaders(env) {
  return {
    Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
    'Accept-Version': 'v1',
  };
}

// Unsplashの応答から、表示とクレジットに必要なものだけ取り出す。
// 余計なキーをそのまま流すと、クライアント側で何が来るか分からなくなる。
function normalizeUnsplashPhotos(data) {
  const results = Array.isArray(data && data.results) ? data.results : [];
  return results
    .slice(0, PHOTO_CANDIDATES)
    .map((p) => {
      const user = (p && p.user) || {};
      const urls = (p && p.urls) || {};
      const links = (p && p.links) || {};
      const profile = httpsOnly(user.links && user.links.html);
      return {
        name: String(user.name || user.username || '').slice(0, 80),
        page: withUtm(profile),
        small: httpsOnly(urls.thumb),    // 一覧の52pxサムネイル（200px）
        large: httpsOnly(urls.small),    // モーダルの大きい写真（400px）
        download: unsplashDownloadUrl(links.download_location),
        source: 'unsplash',
      };
    })
    .filter((p) => p.small && p.large);
}

async function searchPhoto(env, word) {
  const key = `ph:${word}`;
  if (env.RATE_LIMIT) {
    const cached = await env.RATE_LIMIT.get(key);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* 壊れていたら引き直す */ }
    }
  }

  let res;
  try {
    const url = `${UNSPLASH_URL}?query=${encodeURIComponent(word)}`
      + `&per_page=${PHOTO_CANDIDATES}&orientation=squarish&content_filter=high`;
    res = await fetch(url, { headers: unsplashHeaders(env) });
  } catch {
    return null;   // 一時的な失敗はキャッシュしない
  }
  if (!res.ok) return null;

  let data;
  try { data = await res.json(); } catch { return null; }

  const list = normalizeUnsplashPhotos(data);
  // 見つからなかった語も空配列で覚える。同じ語を何度も探しに行かないため。
  if (env.RATE_LIMIT) {
    await env.RATE_LIMIT.put(key, JSON.stringify(list), { expirationTtl: PHOTO_CACHE_TTL });
  }
  return list;
}

// Unsplashの規約で、写真を実際に使うときに download_location を叩く必要がある。
// 失敗してもアプリを止める理由は無いので、結果は見ずに200を返す。
async function handlePhotoUsed(payload, env, cors) {
  const raw = Array.isArray(payload.downloads) ? payload.downloads : [];
  if (raw.length > MAX_PHOTO_WORDS) {
    return fail(`Too many downloads (max ${MAX_PHOTO_WORDS})`, 400, cors);
  }
  const urls = [...new Set(raw.map(unsplashDownloadUrl).filter(Boolean))];
  if (!urls.length || !env.UNSPLASH_ACCESS_KEY) return json({ notified: 0 }, 200, cors);

  await Promise.all(urls.map(async (url) => {
    try { await fetch(url, { headers: unsplashHeaders(env) }); } catch { /* 通知の失敗は無視 */ }
  }));
  return json({ notified: urls.length }, 200, cors);
}

async function handlePhoto(payload, env, cors) {
  const raw = Array.isArray(payload.words) ? payload.words : [];
  if (raw.length > MAX_PHOTO_WORDS) {
    return fail(`Too many words (max ${MAX_PHOTO_WORDS})`, 400, cors);
  }

  const words = [];
  for (const item of raw) {
    const w = normalizePhotoWord(item);
    if (w && !words.includes(w)) words.push(w);
  }

  const photos = {};
  // キーが未設定でもエラーにしない。写真は飾りなので、
  // UNSPLASH_ACCESS_KEY を入れ忘れたWorkerでアプリが壊れないようにする。
  if (!words.length || !env.UNSPLASH_ACCESS_KEY) return json({ photos }, 200, cors);

  const results = await Promise.all(words.map((w) => searchPhoto(env, w)));
  words.forEach((w, i) => {
    if (results[i]) photos[w] = results[i];
  });
  return json({ photos }, 200, cors);
}

// ── 入力の正規化と検証 ────────────────────────────────────────────────────
// 従来の { prompt } 形式と、マルチターンの { contents } 形式の両方を受ける。
// contents は APIキーの悪用を防ぐため text パートのみ許可する
// （inlineData / fileData を通すと画像や任意ファイルを送れてしまう）。
function buildContents(payload) {
  if (Array.isArray(payload.contents) && payload.contents.length) {
    if (payload.contents.length > MAX_TURNS) {
      return { error: `Too many turns (max ${MAX_TURNS})` };
    }
    const contents = [];
    for (const turn of payload.contents) {
      if (!turn || typeof turn !== 'object') return { error: 'Invalid turn' };
      const role = turn.role === 'model' ? 'model' : 'user';
      if (!Array.isArray(turn.parts) || !turn.parts.length) return { error: 'Invalid turn parts' };
      const parts = [];
      for (const part of turn.parts) {
        if (!part || typeof part.text !== 'string') return { error: 'Only text parts are allowed' };
        parts.push({ text: part.text });
      }
      contents.push({ role, parts });
    }
    return { contents };
  }

  if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
    return { contents: [{ role: 'user', parts: [{ text: payload.prompt }] }] };
  }
  return { error: 'Missing prompt' };
}

function totalChars(contents) {
  return contents.reduce(
    (sum, turn) => sum + turn.parts.reduce((s, p) => s + p.text.length, 0),
    0
  );
}

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export default {
  async fetch(request, env) {
    const origins = allowedOriginList(env);
    const cors = corsHeaders(request.headers.get('Origin') || '', origins);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      return fail('Content-Type must be application/json', 415, cors);
    }
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return fail('Request body too large', 413, cors);
    }

    const user = await authenticate(request, env);
    if (!user) return fail('Unauthorized', 401, cors);

    // 本文を読むのはレート制限より先。どちらのカウンタを使うかが
    // action で変わるため。壊れた本文で利用枠を減らさない利点もある。
    let payload;
    try {
      payload = await request.json();
    } catch {
      return fail('Invalid JSON body', 400, cors);
    }

    const limits = payload && PHOTO_ACTIONS.has(payload.action) ? PHOTO_LIMITS : AI_LIMITS;
    const rate = await checkRateLimit(env, user.id, limits);
    if (!rate.ok) {
      // 429で返すとクライアント側の再試行処理が2.5秒後にもう一度投げてしまうため、
      // 利用上限は403で返して「再試行しても無駄」と区別できるようにする。
      return fail('AI usage limit reached', 403, cors, { code: rate.reason, limit: rate.limit });
    }

    if (payload.action === 'photo') return handlePhoto(payload, env, cors);
    if (payload.action === 'photo_used') return handlePhotoUsed(payload, env, cors);

    const built = buildContents(payload);
    if (built.error) return fail(built.error, 400, cors);
    const { contents } = built;

    if (totalChars(contents) > MAX_TEXT_CHARS) {
      return fail(`Prompt too long (max ${MAX_TEXT_CHARS} characters)`, 413, cors);
    }

    const generationConfig = {
      temperature: clamp(payload.temperature, 0, 1.5, 0.3),
      // 以前は1024固定だった。詳細フィードバックのような長いJSONは途中で
      // 切れてJSON.parseが失敗し、結果が丸ごと失われていた。
      maxOutputTokens: clamp(payload.maxOutputTokens, 1, MAX_OUTPUT_TOKENS_CAP, DEFAULT_OUTPUT_TOKENS),
    };
    if (payload.schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = payload.schema;
    }

    const geminiBody = { contents, generationConfig };
    if (typeof payload.system === 'string' && payload.system.trim()) {
      geminiBody.systemInstruction = { parts: [{ text: payload.system }] };
    }
    const body = JSON.stringify(geminiBody);

    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      break;
    }

    const text = await res.text();
    const headers = { 'Content-Type': 'application/json', ...cors };
    if (rate.used) {
      headers['X-AI-Usage'] = `${rate.used}/${rate.limit}`;
      headers['Access-Control-Expose-Headers'] = 'X-AI-Usage';
    }
    return new Response(text, { status: res.status, headers });
  },
};
