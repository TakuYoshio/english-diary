-- 通常は Task/apply-all.sql を1本流せば足ります（このファイルの内容も含まれます）。
-- vocabテーブルに単語のイラスト（画像URL）を保存する列を追加します。
-- 単語追加時にPollinations.ai（無料・APIキー不要の画像生成サービス）で生成したURLを保存します。
-- Supabaseダッシュボード → SQL Editorで実行してください。

alter table public.vocab add column if not exists image_url text;
