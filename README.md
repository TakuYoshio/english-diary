# 📖 英語日記アプリ（フル機能版）

6ステップで英語を本格的に学べる日記アプリ。

## 学習フロー

1. 🇯🇵 日本語で日記を書く
2. ✍️ 自分で英訳（1回目）
3. 📝 わからない単語を控える
4. 🔍 調べて再英訳（2回目）
5. 🤖 Gemini AIが添削＋フィードバック
6. 🔊 音声再生でシャドーイング → 🎤 音声入力で発音チェック

---

## セットアップ

### 1. Supabase（DB・ログイン）

1. [supabase.com](https://supabase.com) でアカウント作成・プロジェクト作成
2. SQL Editor で実行：

```sql
create table entries (
  id bigserial primary key,
  created_at timestamptz default now(),
  date date not null,
  jp text not null,
  en1 text,
  en2 text,
  corrected text
);

create table vocab (
  id bigserial primary key,
  created_at timestamptz default now(),
  en text not null,
  jp text not null,
  note text,
  correct int default 0,
  wrong int default 0
);
```

3. `Task/supabase-migration.sql` の内容を SQL Editor で実行し、`user_id` 列の追加とRow Level Security（自分のデータしか見えない・操作できないポリシー）を有効化する
4. Authentication → Providers で「Email」が有効なことを確認し、Authentication → URL Configuration の Site URL / Redirect URLs に実際のGitHub Pages URL（例: `https://あなたのID.github.io`）を追加
5. Settings → API から **Project URL** と **anon public key** をコピーし、`app.js` 冒頭の `SUPABASE_URL` / `SUPABASE_ANON_KEY` 定数に書き込む（`worker/wrangler.toml` の同名の値も合わせる）
6. 一緒に使う人は、Authentication → Users → **Invite user** から開発者がメールアドレスで招待する（アプリ内にサインアップ画面は無い。招待された人はメールのリンクからパスワードを設定してログインする）

---

### 2. Gemini API + Cloudflare Worker（AI添削・無料）

利用者がGeminiアカウントを作らなくて済むよう、Gemini APIキーは開発者（あなた）だけが持ち、`worker/` ディレクトリの Cloudflare Worker がAPIキーを隠したまま中継します。アクセス制御は「ログイン済みのSupabaseユーザーかどうか」で行うため、利用者は上記のログインさえできればそのままAI添削も使えます。

1. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) で自分用のGemini APIキーを発行（無料・登録不要、`AIza...`）
2. Cloudflareアカウントを作成し、`npx wrangler login` でログイン
3. `worker/wrangler.toml` の `ALLOWED_ORIGIN` を自分のGitHub Pages URL、`SUPABASE_URL` / `SUPABASE_ANON_KEY` を手順1でコピーしたSupabaseの値に書き換える
4. `worker/` ディレクトリで以下を実行し、Geminiキーを登録：
   ```bash
   cd worker
   npx wrangler secret put GEMINI_API_KEY   # 手順1でコピーしたキーを貼り付け
   npx wrangler deploy
   ```
5. デプロイ完了後に表示される `https://english-diary-gemini-proxy.あなたのサブドメイン.workers.dev` をコピーし、`app.js` 冒頭の `WORKER_URL` 定数をこの値に書き換える

無料枠: Cloudflare Workers 1日10万リクエスト、Gemini 1日1,500リクエスト（数人での個人利用なら十分）

---

### 3. 音声再生・音声認識（設定不要）

ブラウザ内蔵のWeb Speech API（`speechSynthesis` / `SpeechRecognition`）を使うため、追加のAPIキーや設定は不要。ChromeかSafariで動作します。

---

### 4. GitHub Pages で公開

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/あなたのID/english-diary.git
git push -u origin main
```

GitHub → Settings → Pages → Source: `main` / `root` → Save

数分後に `https://あなたのID.github.io/english-diary/` で公開。

---

### 5. ログインして使う

- **開発者（あなた）**: Authentication → Users → Invite user から自分のメールアドレスを招待し、届いたメールでパスワードを設定してログイン
- **一緒に使う人**: 同様に開発者から招待してもらい、メールでパスワードを設定してログインするだけ。Googleアカウント作成やAPIキー発行、Supabaseの値の入力は一切不要
- 日記・単語帳のデータはログインしているアカウントごとに完全に分離される（他の人のデータは見えない）

Mac・iPhone・どの端末からもアクセスできます。

> iPhoneはSafari → 共有 → **ホーム画面に追加** でアプリっぽく使えます。

---

## 費用まとめ

| サービス | 費用 |
|---------|------|
| GitHub Pages | 無料 |
| Supabase | 無料（500MB） |
| Cloudflare Workers | 無料（1日10万リクエスト） |
| Gemini API | 無料（1日1,500回） |
| **合計** | **¥0**（数人規模の利用なら） |
# english-diary
