-- vocabテーブルに単語のイラスト（画像URL）を保存する列を追加します。
-- 単語追加時にPollinations.ai（無料・APIキー不要の画像生成サービス）で生成したURLを保存します。
-- Supabaseダッシュボード → SQL Editorで実行してください。

alter table public.vocab add column image_url text;
