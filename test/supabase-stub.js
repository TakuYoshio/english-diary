// CI用のSupabaseスタブ。ネットワークに出ずにUI全体を通すためのもの。
// 本番のindex.htmlはCDNから supabase-js を読むが、テストではこのファイルに差し替える。
(function () {
  const now = Date.now();
  const iso = d => new Date(d).toISOString();
  const day = 86400000;

  const DB = {
    entries: [
      // 日記クイズは corrected の文を出題元にするので、5〜12語の文を持たせておく
      { id: 2, user_id: 'u1', created_at: iso(now - 2 * day), date: new Date(now - 2 * day).toLocaleDateString('sv-SE'),
        jp: '締め切り前で気が進まなかった', en1: 'I am reluctant', en2: 'I felt reluctant before the deadline',
        corrected: 'I felt reluctant before the deadline. My commute was long today.',
        feedback: null, pronunciation_first_attempt: { score: 64, scoredAt: iso(now - 2 * day) } },
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
      // srs_stage は Word Garden の 🌱🌿🌷🌸 を一通り出すために散らしてある
      { id: 1, user_id: 'u1', created_at: iso(now - day), en: 'café', jp: 'カフェ', note: '',
        correct: 3, wrong: 1, srs_stage: 2, next_review_at: iso(now - 1000), last_reviewed_at: iso(now - day), image_url: null },
      { id: 2, user_id: 'u1', created_at: iso(now - day), en: 'commute', jp: '通勤する', note: '',
        correct: 0, wrong: 0, srs_stage: 0, next_review_at: iso(now - 1000), last_reviewed_at: null, image_url: null },
      { id: 3, user_id: 'u1', created_at: iso(now - day), en: 'grateful', jp: '感謝している', note: '',
        correct: 5, wrong: 0, srs_stage: 4, next_review_at: iso(now + 5 * day), last_reviewed_at: iso(now - day), image_url: null },
      { id: 4, user_id: 'u1', created_at: iso(now - day), en: 'overwhelmed', jp: '圧倒された', note: '',
        correct: 6, wrong: 0, srs_stage: 6, next_review_at: iso(now + 80 * day), last_reviewed_at: iso(now - day), image_url: null },
      // 苦手単語（wrong>=2 かつ 正答率<60%）。苦手トグルのテスト用。
      { id: 5, user_id: 'u1', created_at: iso(now - day), en: 'reluctant', jp: '気が進まない', note: '',
        correct: 1, wrong: 4, srs_stage: 0, next_review_at: iso(now - 1000), last_reviewed_at: iso(now - day), image_url: null },
      { id: 6, user_id: 'u1', created_at: iso(now - day), en: 'deadline', jp: '締め切り', note: '',
        correct: 0, wrong: 3, srs_stage: 0, next_review_at: iso(now - 1000), last_reviewed_at: iso(now - day), image_url: null },
    ],
    solo_sessions: [
      { id: 1, user_id: 'u1', created_at: iso(now - 2 * day), date: new Date(now - 2 * day).toLocaleDateString('sv-SE'),
        mode: 'solo', topic_pack: 'today', planned_minutes: 10, spoken_seconds: 600, word_count: 820,
        input_method: 'speech', prompts_used: ['What did you do first thing this morning?'],
        transcript: 'I went to a cafe near my office this morning and it was surprisingly quiet',
        report_status: 'ready',
        report: {
          summary_jp: 'カフェの話を落ち着いたペースで話せていました。',
          stats: { fluency_score: 72, variety_score: 64, accuracy_score: 81, used_vocab: ['café'] },
          good_expressions: [{ text: 'it was surprisingly quiet', why_jp: '副詞が効いています' }],
          corrections: [{ before: 'I go to cafe', after: 'I went to a cafe', explanation_jp: '過去形に', category: 'grammar', confidence: 'high' }],
          upgrade_suggestions: [{ you_said: 'very good', native_way: 'really solid' }],
          suggested_vocab: [{ en: 'atmosphere', jp: '雰囲気', note: '' }],
          next_time_focus_jp: '過去形を意識してみよう',
        } },
      // レポート生成に失敗したケース（記録だけ残る）
      { id: 2, user_id: 'u1', created_at: iso(now - 5 * day), date: new Date(now - 5 * day).toLocaleDateString('sv-SE'),
        mode: 'solo', topic_pack: 'mixed', planned_minutes: 5, spoken_seconds: 300, word_count: 410,
        input_method: 'mixed', prompts_used: [], transcript: 'short session text',
        report: null, report_status: 'failed' },
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
      not(col, op, val) {
        if (op === 'is' && val === null) rows = rows.filter(r => r[col] != null);
        return this;
      },
      gte(col, val) { rows = rows.filter(r => String(r[col]) >= String(val)); return this; },
      lte(col, val) { rows = rows.filter(r => String(r[col]) <= String(val)); return this; },
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
