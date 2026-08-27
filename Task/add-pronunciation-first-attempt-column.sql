-- entriesテーブルに「初回の発音チェック結果」を保存するための列を追加します。
-- 2回目以降のリトライでは上書きせず、常に最初の1回だけを記録します。
-- Supabaseダッシュボード → SQL Editorで実行してください。

alter table public.entries add column pronunciation_first_attempt jsonb;
