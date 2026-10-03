-- ============================================================
-- 英語日記アプリ: データベースのセットアップ（これ1本だけでよい）
--
-- Supabaseダッシュボード → SQL Editor にこのファイルの中身を貼って実行してください。
--
-- ・新規セットアップでも、すでに動かしている環境でも、同じものを流せます
-- ・何回流しても結果は同じです（すべて if not exists / drop-then-create）
-- ・既存のデータには一切触れません（delete / drop table / alter column を使いません）
--
-- 「何かが保存できない」「新しい機能が動かない」ときは、まずこれを流してください。
-- 何が足りないか先に見たい場合は Task/check-schema.sql を実行してください。
--
-- 注意: create table if not exists は、すでにあるテーブルには列を足しません。
-- そのため下では「テーブルの作成」と「列の追加」を両方書いています。
-- 片方だけだと、既存環境で列が足りないまま「成功」と表示されてしまいます。
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. 日記
-- ════════════════════════════════════════════════════════════
create table if not exists public.entries (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  date        date not null,
  jp          text not null,
  en1         text,
  en2         text,
  corrected   text
);

-- 既存のentriesに後から足した列。
-- user_id はここでは足さない。既存行がある状態で NOT NULL + auth.uid() を足すと
-- 「null値が含まれる」で失敗するため。RLSの前提なので通常は必ず存在する。
-- 万一無い場合は Task/supabase-migration.sql を参照（データの持ち主を決める必要がある）。
alter table public.entries add column if not exists created_at timestamptz not null default now();
alter table public.entries add column if not exists en1 text;
alter table public.entries add column if not exists en2 text;
alter table public.entries add column if not exists corrected text;
-- AI添削のフィードバック（良かった点・カテゴリ別の添削）
alter table public.entries add column if not exists feedback jsonb;
-- 初回の発音チェック結果だけを記録する
alter table public.entries add column if not exists pronunciation_first_attempt jsonb;


-- ════════════════════════════════════════════════════════════
-- 2. 単語帳
-- ════════════════════════════════════════════════════════════
create table if not exists public.vocab (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  en          text not null,
  jp          text not null,
  note        text,
  correct     int not null default 0,
  wrong       int not null default 0
);

alter table public.vocab add column if not exists created_at timestamptz not null default now();
alter table public.vocab add column if not exists note text;
alter table public.vocab add column if not exists correct int not null default 0;
alter table public.vocab add column if not exists wrong int not null default 0;
-- 単語カードの写真（Pexelsで検索した写真のURL）。
-- null = まだ探していない / 空文字 = 利用者が「写真を外す」を選んだ / URL = 選ばれた写真
alter table public.vocab add column if not exists image_url text;
-- その写真の撮影者クレジット { name, page, large, source }。
-- Pexelsの規約で撮影者名とPexelsへのリンクの表示が必要なため、URLとは別に持つ。
alter table public.vocab add column if not exists image_credit jsonb;
-- 間隔反復（エビングハウスの忘却曲線を参考にしたLeitner方式）
alter table public.vocab add column if not exists srs_stage integer not null default 0;
alter table public.vocab add column if not exists next_review_at timestamptz not null default now();
alter table public.vocab add column if not exists last_reviewed_at timestamptz;


-- ════════════════════════════════════════════════════════════
-- 3. 学習設定
-- ════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  onboarding_completed boolean not null default false,
  skill_focus          text[] not null default '{}'::text[],
  shadowing_level      text not null default 'normal',
  auto_vocab_lookup    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists skill_focus text[] not null default '{}'::text[];
alter table public.profiles add column if not exists shadowing_level text not null default 'normal';
alter table public.profiles add column if not exists auto_vocab_lookup boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();


-- ════════════════════════════════════════════════════════════
-- 4. 英語ひとりごと（Solo Talk）のセッション記録
-- ════════════════════════════════════════════════════════════
create table if not exists public.solo_sessions (
  id              bigserial primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  date            date not null,
  mode            text not null default 'solo',
  topic_pack      text not null default 'mixed',
  planned_minutes integer not null default 5,
  spoken_seconds  integer not null default 0,
  word_count      integer not null default 0,
  input_method    text not null default 'speech',
  prompts_used    text[] not null default '{}'::text[],
  transcript      text not null default '',
  report          jsonb,
  report_status   text not null default 'pending'
);

alter table public.solo_sessions add column if not exists mode text not null default 'solo';
alter table public.solo_sessions add column if not exists topic_pack text not null default 'mixed';
alter table public.solo_sessions add column if not exists planned_minutes integer not null default 5;
alter table public.solo_sessions add column if not exists spoken_seconds integer not null default 0;
alter table public.solo_sessions add column if not exists word_count integer not null default 0;
alter table public.solo_sessions add column if not exists input_method text not null default 'speech';
alter table public.solo_sessions add column if not exists prompts_used text[] not null default '{}'::text[];
alter table public.solo_sessions add column if not exists transcript text not null default '';
alter table public.solo_sessions add column if not exists report jsonb;
alter table public.solo_sessions add column if not exists report_status text not null default 'pending';


-- ════════════════════════════════════════════════════════════
-- 5. インデックス
-- ════════════════════════════════════════════════════════════
create index if not exists entries_user_date_idx      on public.entries (user_id, date desc);
create index if not exists vocab_user_review_idx      on public.vocab (user_id, next_review_at);
create index if not exists solo_sessions_user_date_idx on public.solo_sessions (user_id, date desc);


-- ════════════════════════════════════════════════════════════
-- 6. Row Level Security（自分の行しか見えない・操作できない）
-- ════════════════════════════════════════════════════════════
alter table public.entries       enable row level security;
alter table public.vocab         enable row level security;
alter table public.profiles      enable row level security;
alter table public.solo_sessions enable row level security;

-- Postgresには create policy if not exists が無いので、消してから作り直す
do $$
declare
  tbl text;
begin
  foreach tbl in array array['entries', 'vocab', 'profiles', 'solo_sessions'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);

    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)',
                   tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)',
                   tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
                   tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)',
                   tbl || '_delete_own', tbl);
  end loop;
end $$;


-- 完了。エラーが出なければスキーマは最新です。
