-- ============================================================
-- 英語日記アプリ: ログイン機能導入のためのSupabase移行スクリプト
-- Supabaseダッシュボード → SQL Editor に貼り付けて実行してください。
-- テストデータのみとのことなので、既存行は先に削除してから進めます。
-- ============================================================

-- 1. 既存のテストデータを削除
--
-- ⚠️ この2行は初回セットアップ時にテストデータを消すためのものです。
-- すでに本番運用を始めている環境で実行すると、全ユーザーの日記と単語帳が
-- 失われます。新規セットアップのときだけコメントを外してください。
--
-- delete from public.entries;
-- delete from public.vocab;

-- 2. user_id列を追加（auth.usersを参照。ユーザー削除時に連動して行も削除される）
alter table public.entries
  add column user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;

alter table public.vocab
  add column user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;

-- 3. Row Level Securityを有効化
alter table public.entries enable row level security;
alter table public.vocab enable row level security;

-- 4. ポリシー: 自分の行しかCRUDできないようにする
create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);

create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);

create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

create policy "vocab_select_own" on public.vocab
  for select using (auth.uid() = user_id);

create policy "vocab_insert_own" on public.vocab
  for insert with check (auth.uid() = user_id);

create policy "vocab_update_own" on public.vocab
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "vocab_delete_own" on public.vocab
  for delete using (auth.uid() = user_id);
