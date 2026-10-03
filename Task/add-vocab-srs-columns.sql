-- 通常は Task/apply-all.sql を1本流せば足ります（このファイルの内容も含まれます）。
-- vocabテーブルに間隔反復（SRS）用の列を追加します。
-- エビングハウスの忘却曲線を参考にした固定ステージ×日数（Leitner方式）でスケジューリングします。
-- Supabaseダッシュボード → SQL Editorで実行してください。

alter table public.vocab add column if not exists srs_stage integer not null default 0;
alter table public.vocab add column if not exists next_review_at timestamptz not null default now();
alter table public.vocab add column if not exists last_reviewed_at timestamptz;
