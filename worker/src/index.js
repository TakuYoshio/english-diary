'use strict';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

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
async function checkRateLimit(env, userId) {
  if (!env.RATE_LIMIT) return { ok: true };

  const now = new Date();
  const dayKey = `rl:${userId}:${now.toISOString().slice(0, 10)}`;
  const minKey = `rlm:${userId}:${Math.floor(now.getTime() / 60000)}`;

  const [dayRaw, minRaw] = await Promise.all([
    env.RATE_LIMIT.get(dayKey),
    env.RATE_LIMIT.get(minKey),
  ]);
  const day = Number(dayRaw) || 0;
  const min = Number(minRaw) || 0;

  if (day >= DAILY_LIMIT) return { ok: false, reason: 'DAILY_LIMIT', limit: DAILY_LIMIT };
  if (min >= BURST_LIMIT) return { ok: false, reason: 'BURST_LIMIT', limit: BURST_LIMIT };

  await Promise.all([
    env.RATE_LIMIT.put(dayKey, String(day + 1), { expirationTtl: 172800 }),
    env.RATE_LIMIT.put(minKey, String(min + 1), { expirationTtl: 120 }),
  ]);
  return { ok: true, used: day + 1, limit: DAILY_LIMIT };
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

    const rate = await checkRateLimit(env, user.id);
    if (!rate.ok) {
      // 429で返すとクライアント側の再試行処理が2.5秒後にもう一度投げてしまうため、
      // 利用上限は403で返して「再試行しても無駄」と区別できるようにする。
      return fail('AI usage limit reached', 403, cors, { code: rate.reason, limit: rate.limit });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return fail('Invalid JSON body', 400, cors);
    }

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
