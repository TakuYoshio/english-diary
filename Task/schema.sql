-- ============================================================
-- 英語日記アプリ: 現在のスキーマ一式（新規セットアップ用）
--
-- これ1本を Supabase ダッシュボード → SQL Editor で実行すれば、
-- テーブル・列・Row Level Security がすべて揃います。
--
-- 既存環境には実行しないでください。既存環境へ個別の列を足す場合は
-- Task/add-*.sql を参照してください（このファイルはそれらを統合したものです）。
-- ============================================================

-- ── 日記 ────────────────────────────────────────────────────────────────
create table public.entries (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  date        date not null,
  jp          text not null,                 -- 日本語の原文
  en1         text,                          -- 自分の英訳（1回目）
  en2         text,                          -- 調べたあとの英訳（2回目）
  corrected   text,                          -- AI添削後の英文
  feedback    jsonb,                         -- 良かった点・カテゴリ別の添削
  pronunciation_first_attempt jsonb          -- 初回の発音チェック結果のみ記録
);

-- ── 単語帳（間隔反復つき） ───────────────────────────────────────────────
create table public.vocab (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  en          text not null,
  jp          text not null,
  note        text,
  correct     int not null default 0,
  wrong       int not null default 0,
  image_url   text,                          -- Pollinations.aiで生成したイラスト
  -- 間隔反復（エビングハウスの忘却曲線を参考にしたLeitner方式）
  srs_stage        integer not null default 0,
  next_review_at   timestamptz not null default now(),
  last_reviewed_at timestamptz
);

-- ── 学習設定 ────────────────────────────────────────────────────────────
create table public.profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  onboarding_completed boolean not null default false,
  skill_focus          text[] not null default '{}'::text[], -- grammar/vocabulary/naturalness/pronunciation
  shadowing_level      text not null default 'normal' check (shadowing_level in ('easy','normal','hard')),
  auto_vocab_lookup    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 検索用インデックス ──────────────────────────────────────────────────
create index entries_user_date_idx on public.entries (user_id, date desc);
create index vocab_user_review_idx on public.vocab (user_id, next_review_at);

-- ── Row Level Security（自分の行しか見えない・操作できない） ─────────────
alter table public.entries  enable row level security;
alter table public.vocab    enable row level security;
alter table public.profiles enable row level security;

create policy "entries_select_own" on public.entries for select using (auth.uid() = user_id);
create policy "entries_insert_own" on public.entries for insert with check (auth.uid() = user_id);
create policy "entries_update_own" on public.entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "entries_delete_own" on public.entries for delete using (auth.uid() = user_id);

create policy "vocab_select_own" on public.vocab for select using (auth.uid() = user_id);
create policy "vocab_insert_own" on public.vocab for insert with check (auth.uid() = user_id);
create policy "vocab_update_own" on public.vocab for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vocab_delete_own" on public.vocab for delete using (auth.uid() = user_id);

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = user_id);
