-- entriesテーブルにAIフィードバック（良かった点・改善点・修正ポイント・単語の使い方）を
-- 保存するための列を追加します。Supabaseダッシュボード → SQL Editorで実行してください。

alter table public.entries add column feedback jsonb;
