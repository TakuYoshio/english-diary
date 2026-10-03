-- 通常は Task/apply-all.sql を1本流せば足ります（このファイルの内容も含まれます）。
-- vocabテーブルに単語カードの写真を保存する列を追加します。
-- Pexelsで検索した写真のURLと、その撮影者クレジットを保存します。
-- Supabaseダッシュボード → SQL Editorで実行してください。

alter table public.vocab add column if not exists image_url text;
alter table public.vocab add column if not exists image_credit jsonb;
