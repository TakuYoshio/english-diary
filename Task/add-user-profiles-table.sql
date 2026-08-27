-- ユーザーごとの学習設定（伸ばしたいスキル・シャドーイングレベル・単語自動検索・オンボーディング完了フラグ）
-- を保存するprofilesテーブルを追加します。Supabaseダッシュボード → SQL Editorで実行してください。

create table public.profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  onboarding_completed boolean not null default false,
  skill_focus          text[] not null default '{}'::text[], -- grammar / vocabulary / naturalness / pronunciation の部分集合
  shadowing_level      text not null default 'normal' check (shadowing_level in ('easy','normal','hard')),
  auto_vocab_lookup    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = user_id);
