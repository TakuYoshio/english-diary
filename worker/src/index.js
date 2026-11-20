'use strict';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const ICONIFY_SEARCH = 'https://api.iconify.design/search';

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

// 単語カードのアイコン検索（Iconify。APIキー不要）。
// 語ごとにKVへ長期キャッシュするので、同じ語で外に出るのは1回だけ。
const MAX_PHOTO_WORDS = 20;         // 1リクエストで引ける語数
const PHOTO_CANDIDATES = 5;         // 1語あたりに返す候補数
const ICON_SEARCH_LIMIT = 64;       // Iconifyから受け取って絞り込む前の件数
const PHOTO_CACHE_TTL = 30 * 86400; // KVに置く期間（秒）
const PHOTO_DAILY_LIMIT = 200;
const PHOTO_BURST_LIMIT = 40;
const PHOTO_ACTIONS = new Set(['photo']);

// 見た目を揃えるためのセットの優先順位。先にあるものほど優先する。
// コトラの丸い雰囲気（Baloo 2・角丸）に近い線アイコンから並べてある。
// 素の検索は material-symbols:commute / -outline / -rounded / ic:baseline-commute …と
// 同じ絵の変種を大量に返すので、セットを決め打ちしないと一覧がバラバラになる。
const ICON_SET_RANK = [
  'ph', 'tabler', 'lucide', 'solar', 'mingcute', 'hugeicons',
  'material-symbols-light', 'material-symbols', 'mdi-light', 'mdi',
  'carbon', 'ion', 'bi', 'fluent', 'majesticons', 'iconoir',
];

// 使ってよいライセンス（SPDX）。CC-BY系はクレジット表示を出す前提で許可する。
// 判定できないセットは使わない（素性の分からないアイコンを配らないため）。
const ICON_LICENSES_OK = new Set([
  'MIT', 'Apache-2.0', 'ISC', 'CC0-1.0', 'Unlicense',
  'BSD-3-Clause', 'BSD-2-Clause', 'OFL-1.1', 'CC-BY-4.0', 'CC-BY-SA-4.0',
]);

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

// ── アイコン検索（Iconify） ───────────────────────────────────────────────
// 単語カードの絵は、生成AI → ストックフォト → ピクトグラム と変えてきた。
// 写真は「きれいに見えること」が目的で作られているので、deadline を引くと
// 締め切りっぽい雰囲気の机が返る。ピクトグラムは「一つの概念を伝えること」
// だけが目的なので、時計やカレンダーという明確な記号が返る。52pxでも潰れない。
// Iconify は 150以上のオープンなアイコンセットを横断検索でき、APIキーが要らない。

// 英単語以外は弾く。Workerを任意の検索プロキシにしないため。
function normalizePhotoWord(raw) {
  if (typeof raw !== 'string') return '';
  const w = raw.trim().toLowerCase();
  if (!w || w.length > 40) return '';
  if (!/^[a-z][a-z0-9 '-]*$/.test(w)) return '';
  return w;
}

const httpsOnly = (v) => (typeof v === 'string' && v.startsWith('https://') ? v : '');

// 使えるセットか。単色（色を指定できる）で、ライセンスが分かっているものだけ。
// palette=true のセットは自前の色を持っていて ?color= が効かないので、
// 「コーラル1色で揃える」という条件を満たせない。
function usableIconSet(collection) {
  if (!collection || typeof collection !== 'object') return false;
  if (collection.palette === true) return false;
  const spdx = collection.license && collection.license.spdx;
  return typeof spdx === 'string' && ICON_LICENSES_OK.has(spdx);
}

// 候補の良さ。小さいほど良い。
// 素の検索は同じ絵の変種を大量に返すので、ここで見た目と一致度を揃える。
function iconScore(prefix, name, query) {
  const rank = ICON_SET_RANK.indexOf(prefix);
  // 優先リストに無いセットは後ろへ回す（使ってよいが、見た目が揃わない）
  let score = (rank === -1 ? ICON_SET_RANK.length + 5 : rank) * 10;

  // 名前の一致度。iconoven:deadline を iconmind:enrol-deadline-duotone-bold より優先する。
  const parts = name.split('-');
  if (name === query) score -= 8;
  else if (parts[0] === query) score -= 5;
  else if (parts.includes(query)) score -= 3;

  // 塗りつぶしより線を好む（利用者の選択）。
  // material-symbols は既定が塗りつぶしで、-outline が線版。
  if (/(^|-)(outline|line|light|thin)(-|$)/.test(name)) score -= 4;
  if (/(^|-)(fill|filled|solid|bold|duotone|twotone)(-|$)/.test(name)) score += 4;

  // 余計な修飾が少ないものを好む
  score += Math.min(parts.length, 6);
  return score;
}

// Iconifyの応答から、表示とクレジットに必要なものだけ取り出して並べ替える。
function normalizeIcons(data, query) {
  const icons = Array.isArray(data && data.icons) ? data.icons : [];
  const collections = (data && data.collections) || {};

  const scored = [];
  for (const full of icons) {
    if (typeof full !== 'string') continue;
    const at = full.indexOf(':');
    if (at <= 0) continue;
    const prefix = full.slice(0, at), name = full.slice(at + 1);
    const col = collections[prefix];
    if (!usableIconSet(col)) continue;
    scored.push({
      icon: full,
      set: String(col.name || prefix).slice(0, 60),
      license: String((col.license && col.license.title) || col.license.spdx).slice(0, 60),
      page: httpsOnly(col.license && col.license.url) || httpsOnly(col.url),
      source: 'iconify',
      _score: iconScore(prefix, name, query),
    });
  }
  scored.sort((a, b) => a._score - b._score);

  // 同じセットばかり並べない。候補は「別のアイコンにする」で切り替えるものなので、
  // 違う絵が出てくるほうが役に立つ。
  const seenSet = new Set();
  const picked = [];
  for (const c of scored) {
    const prefix = c.icon.slice(0, c.icon.indexOf(':'));
    if (seenSet.has(prefix)) continue;
    seenSet.add(prefix);
    delete c._score;
    picked.push(c);
    if (picked.length >= PHOTO_CANDIDATES) break;
  }
  return picked;
}

async function fetchIcons(query) {
  let res;
  try {
    res = await fetch(`${ICONIFY_SEARCH}?query=${encodeURIComponent(query)}&limit=${ICON_SEARCH_LIMIT}`);
  } catch {
    return null;   // 一時的な失敗。キャッシュしない
  }
  if (!res.ok) return null;
  let data;
  try { data = await res.json(); } catch { return null; }
  return normalizeIcons(data, query);
}

// grateful や reluctant は、そのまま引いても Iconify は0件を返す。
// アイコンになりそうな具体語に言い換えるのは世界知識が要るのでAIに任せる。
// 結果は語ごとにKVへ入れるので、同じ語では全利用者を通じて1回しか呼ばない。
const ICON_HINT_SCHEMA = {
  type: 'object',
  properties: { keywords: { type: 'array', items: { type: 'string' } } },
  required: ['keywords'],
};

async function iconKeywordHints(env, word) {
  if (!env.GEMINI_API_KEY) return [];
  const prompt = `The English word "${word}" needs a simple pictogram for a vocabulary flashcard.`
    + ' Reply with 1-3 concrete, common icon keywords that an icon library would actually have'
    + ' and that visually suggest this word\'s meaning.'
    + ' Use single lowercase English words or short hyphenated terms (e.g. "hesitate", "question-mark", "handshake").'
    + ' Prefer objects, gestures and simple scenes over abstract nouns.';
  let res;
  try {
    res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 128,
          responseMimeType: 'application/json',
          responseSchema: ICON_HINT_SCHEMA,
        },
      }),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  try {
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(text);
    return (Array.isArray(parsed.keywords) ? parsed.keywords : [])
      .map(normalizePhotoWord)
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function searchPhoto(env, word) {
  const key = `ph:${word}`;
  if (env.RATE_LIMIT) {
    const cached = await env.RATE_LIMIT.get(key);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* 壊れていたら引き直す */ }
    }
  }

  let list = await fetchIcons(word);
  if (list === null) return null;   // 通信失敗。キャッシュせず次回やり直す

  // 素の検索で0件だった語だけAIに言い換えてもらう
  if (!list.length) {
    for (const hint of await iconKeywordHints(env, word)) {
      const alt = await fetchIcons(hint);
      if (alt && alt.length) { list = alt; break; }
    }
  }

  // 見つからなかった語も空配列で覚える。同じ語を何度も探しに行かないため。
  if (env.RATE_LIMIT) {
    await env.RATE_LIMIT.put(key, JSON.stringify(list), { expirationTtl: PHOTO_CACHE_TTL });
  }
  return list;
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
  if (!words.length) return json({ photos }, 200, cors);

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
