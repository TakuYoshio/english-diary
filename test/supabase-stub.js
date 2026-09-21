// CI用のSupabaseスタブ。ネットワークに出ずにUI全体を通すためのもの。
// 本番のindex.htmlはCDNから supabase-js を読むが、テストではこのファイルに差し替える。
(function () {
  const now = Date.now();
  const iso = d => new Date(d).toISOString();
  const day = 86400000;

  const DB = {
    entries: [
      { id: 1, user_id: 'u1', created_at: iso(now - day), date: new Date(now - day).toLocaleDateString('sv-SE'),
        jp: 'カフェに行った', en1: 'I go to cafe', en2: 'I went to a cafe',
        corrected: 'I went to a café yesterday.',
        feedback: { good_points: ['過去形が使えています'], categories: [
          { category: 'grammar', summary: '冠詞に注意', corrections: [
            { before: 'I go to cafe', after: 'I went to a café', explanation: '過去の話なので過去形に' } ] } ],
          vocab_usage: '' },
        pronunciation_first_attempt: { score: 85, scoredAt: iso(now - day) } },
    ],
    vocab: [
      { id: 1, user_id: 'u1', created_at: iso(now - day), en: 'café', jp: 'カフェ', note: '',
        correct: 3, wrong: 1, srs_stage: 2, next_review_at: iso(now - 1000), last_reviewed_at: iso(now - day), image_url: null },
      { id: 2, user_id: 'u1', created_at: iso(now - day), en: 'commute', jp: '通勤する', note: '',
        correct: 0, wrong: 0, srs_stage: 0, next_review_at: iso(now - 1000), last_reviewed_at: null, image_url: null },
      { id: 3, user_id: 'u1', created_at: iso(now - day), en: 'grateful', jp: '感謝している', note: '',
        correct: 5, wrong: 0, srs_stage: 4, next_review_at: iso(now + 5 * day), last_reviewed_at: iso(now - day), image_url: null },
    ],
    profiles: [
      { user_id: 'u1', onboarding_completed: true, skill_focus: ['grammar'],
        shadowing_level: 'easy', auto_vocab_lookup: false },
    ],
  };

  const session = { access_token: 'stub-token', user: { id: 'u1', email: 'test@example.com' } };

  function builder(table) {
    let rows = DB[table].slice();
    const res = () => Promise.resolve({ data: rows, count: rows.length, error: null });
    const api = {
      select(_cols, opts) { this._count = opts && opts.count; return this; },
      eq(col, val) { rows = rows.filter(r => String(r[col]) === String(val)); return this; },
      order() { return this; },
      or() { return this; },
      limit(n) { rows = rows.slice(0, n); return this; },
      range(from, to) { rows = rows.slice(from, to + 1); return this; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      insert(payload) {
        const items = Array.isArray(payload) ? payload : [payload];
        items.forEach(it => DB[table].push({ id: DB[table].length + 100, ...it }));
        return Promise.resolve({ data: items, error: null });
      },
      update(patch) { this._patch = patch; return this; },
      upsert() { return Promise.resolve({ data: null, error: null }); },
      delete() { this._delete = true; return this; },
      then(onOk, onErr) { return res().then(onOk, onErr); },
    };
    return api;
  }

  window.supabase = {
    createClient() {
      return {
        from: builder,
        auth: {
          getSession: () => Promise.resolve({ data: { session }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: () => Promise.resolve({ data: { session }, error: null }),
          signOut: () => Promise.resolve({ error: null }),
          resetPasswordForEmail: () => Promise.resolve({ error: null }),
          updateUser: () => Promise.resolve({ error: null }),
        },
      };
    },
  };
})();
