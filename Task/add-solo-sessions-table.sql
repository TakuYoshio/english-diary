-- 英語ひとりごと（Solo Talk）セッションの記録とAIレポートを保存するテーブルを追加します。
-- transcript は音声認識の生テキスト、report は Gemini が返したレポートJSONです。
-- Supabaseダッシュボード → SQL Editorで実行してください。
--
-- 注意: id の型は entries / vocab に合わせて bigserial にしています。
-- 既存テーブルが別の型で作られている場合はそちらに合わせてください。

create table public.solo_sessions (
  id              bigserial primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- 日付はクライアントの暦日を明示的に送る（サーバ既定のcurrent_dateはUTCなので
  -- JSTの夜のセッションが翌日扱いになってしまう）
  date            date not null,
  mode            text not null default 'solo' check (mode in ('solo', 'talk')),
  topic_pack      text not null default 'mixed',
  planned_minutes integer not null check (planned_minutes between 1 and 180),
  spoken_seconds  integer not null default 0,
  word_count      integer not null default 0,
  input_method    text not null default 'speech' check (input_method in ('speech', 'typing', 'mixed')),
  prompts_used    text[] not null default '{}'::text[],
  transcript      text not null default '',
  report          jsonb,
  -- AI呼び出しに失敗してもセッション自体は保存する（話した内容を失わないため）
  report_status   text not null default 'pending' check (report_status in ('pending', 'ready', 'failed', 'skipped'))
);

create index solo_sessions_user_date_idx on public.solo_sessions (user_id, date desc);

alter table public.solo_sessions enable row level security;

create policy "solo_sessions_select_own" on public.solo_sessions
  for select using (auth.uid() = user_id);
create policy "solo_sessions_insert_own" on public.solo_sessions
  for insert with check (auth.uid() = user_id);
create policy "solo_sessions_update_own" on public.solo_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo_sessions_delete_own" on public.solo_sessions
  for delete using (auth.uid() = user_id);
