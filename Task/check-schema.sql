-- ============================================================
-- セットアップ診断: 足りないテーブル・列・RLSを一覧で返します。
-- Supabaseダッシュボード → SQL Editor に貼って実行してください。
--
-- このアプリのマイグレーションは Task/*.sql を手で実行する方式なので、
-- どれを適用済みか分からなくなりがちです（実際、image_url 列の未適用で
-- 単語が保存できなくなったことがあります）。
-- 何も行が返らなければ、スキーマは最新です。
-- 行が返ったら、そこに書かれた SQL をそのまま実行してください。
-- ============================================================

with expected(tbl, col, fix) as (values
  -- entries
  ('entries', 'feedback',
   'alter table public.entries add column if not exists feedback jsonb;'),
  ('entries', 'pronunciation_first_attempt',
   'alter table public.entries add column if not exists pronunciation_first_attempt jsonb;'),
  -- vocab
  ('vocab', 'image_url',
   'alter table public.vocab add column if not exists image_url text;'),
  ('vocab', 'srs_stage',
   'alter table public.vocab add column if not exists srs_stage integer not null default 0;'),
  ('vocab', 'next_review_at',
   'alter table public.vocab add column if not exists next_review_at timestamptz not null default now();'),
  ('vocab', 'last_reviewed_at',
   'alter table public.vocab add column if not exists last_reviewed_at timestamptz;'),
  -- profiles / solo_sessions は列ではなくテーブルごと必要（下で別に見る）
  ('profiles', 'user_id', 'Task/add-user-profiles-table.sql を実行してください'),
  ('solo_sessions', 'id', 'Task/add-solo-sessions-table.sql を実行してください')
)
select
  e.tbl  as "テーブル",
  e.col  as "足りない列",
  e.fix  as "実行するSQL"
from expected e
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = e.tbl and c.column_name = e.col
)

union all

-- Row Level Security が無効なテーブル（有効でないと他人のデータが見えてしまう）
select
  c.relname::text,
  '(RLSが無効)',
  format('alter table public.%I enable row level security;', c.relname)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('entries', 'vocab', 'profiles', 'solo_sessions')
  and c.relrowsecurity = false

order by 1, 2;
