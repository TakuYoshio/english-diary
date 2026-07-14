'use strict';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function isAuthorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  return res.ok;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin') || '', env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }
    if (!(await isAuthorized(request, env))) {
      return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const { prompt, schema } = payload;
    if (!prompt) {
      return new Response(JSON.stringify({ error: { message: 'Missing prompt' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const generationConfig = { temperature: 0.3 };
    if (schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = schema;
    }
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig });

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

    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  },
};
