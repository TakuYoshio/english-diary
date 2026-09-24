# 📖 英語日記アプリ

6ステップで英語を本格的に学べる日記アプリ。ビルド工程なしの静的サイトで、
GitHub Pages・Supabase・Cloudflare Workers・Gemini の無料枠だけで動きます。

## 学習フロー

1. 🇯🇵 日本語で日記を書く
2. ✍️ 自分で英訳（1回目）
3. 📝 わからない単語を控える（AIの自動検索もオンにできる）
4. 🔍 調べて再英訳（2回目）
5. 🤖 AIが添削＋文法・語彙・表現の観点でフィードバック
6. 🔊 音声再生でシャドーイング → 🎤 音声入力で発音チェック（発音アドバイス付き）

さらに、単語帳（間隔反復つき・記憶の育ち具合を🌱→🌸で可視化）・単語テスト3形式・
日記から復習・状況文で練習・学習カレンダー・統計ダッシュボード・コトラの週報・
マスコット「コトラ」のゲーミフィケーションがあります。

## 🎙 英語でひとりごと

5/10/30/60分を選んで英語だけで話し続け、終了時にAIが添削レポートを返すモードです。

**対応端末の注意**: ブラウザの音声認識（Web Speech API）を使うため、長時間の連続認識には
端末ごとの制約があります。

- 認識は数十秒ごとに自動で切れて再接続します。**そのたびに数語を取りこぼすことがあります**
- **画面が消えると認識が止まります。** 自動ロックをオフにしてください
- **iPhone (Safari)**: 自動再開が効かないことがあります。その場合は画面の
  「タップして続ける」で再開してください（タイマーは止まりません）
- **Android (Chrome)**: 再接続のたびに通知音が鳴る端末があります。ヘッドホンの使用を推奨します
- マイクが使えない場合はタイピングでも参加できます

レポート生成は1日3回まで。60秒・40語に満たないセッションではAIを呼びません。

---

## セットアップ

### 1. Supabase（DB・ログイン）

1. [supabase.com](https://supabase.com) でアカウント作成・プロジェクト作成
2. SQL Editor で **`Task/schema.sql`** を実行する
   （テーブル・列・インデックス・Row Level Security が一括で作られます）。
   続けて **`Task/add-solo-sessions-table.sql`** も実行する（英語ひとりごと用）
3. Authentication → Providers で「Email」が有効なことを確認し、
   Authentication → URL Configuration の Site URL / Redirect URLs に
   実際の GitHub Pages URL（例: `https://あなたのID.github.io`）を追加
4. Settings → API から **Project URL** と **anon public key** をコピーし、
   `app.js` 冒頭の `SUPABASE_URL` / `SUPABASE_ANON_KEY` に書き込む
   （`worker/wrangler.toml` の同名の値も合わせる）
5. 一緒に使う人は Authentication → Users → **Invite user** から招待する
   （アプリ内にサインアップ画面はありません）

> すでに運用中の環境に列を足す場合は `Task/add-*.sql` を個別に実行してください。
> `Task/supabase-migration.sql` は初回移行用で、冒頭に全行削除が含まれています
> （既定ではコメントアウト済み）。

### 2. Gemini API + Cloudflare Worker（AI添削）

利用者がGeminiアカウントを作らなくて済むよう、APIキーは開発者だけが持ち、
`worker/` の Cloudflare Worker がキーを隠したまま中継します。アクセス制御は
「ログイン済みのSupabaseユーザーかどうか」で行います。

1. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) でGemini APIキーを発行
2. Cloudflareアカウントを作成し、`npx wrangler login`
3. `worker/wrangler.toml` の `ALLOWED_ORIGIN` を自分のGitHub Pages URLに、
   `SUPABASE_URL` / `SUPABASE_ANON_KEY` を手順1の値に書き換える
4. **レート制限用のKVを作る**（1アカウントで無料枠を使い切られないようにするため）:
   ```bash
   cd worker
   npx wrangler kv namespace create RATE_LIMIT
   ```
   出力された `id` を `wrangler.toml` の `[[kv_namespaces]]` に貼る。
   設定しないままでもWorkerは動きますが、**レート制限は無効になります**。
5. キーを登録してデプロイ:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler deploy
   ```
6. 表示された `https://....workers.dev` を `app.js` 冒頭の `WORKER_URL` に書く

上限は1ユーザーあたり1日80回・1分10回（`worker/src/index.js` の定数）。

### 3. 音声再生・音声認識（設定不要）

ブラウザ内蔵の Web Speech API を使うため追加の設定は不要です。
**ChromeかSafariが必要**で、他のブラウザでは音声機能のみ使えません。

### 4. GitHub Pages で公開

リポジトリを push し、GitHub → Settings → Pages → Source: `main` / `root` → Save。
数分後に `https://あなたのID.github.io/english-diary/` で公開されます。

iPhoneはSafari → 共有 → **ホーム画面に追加**、Androidは Chrome のメニューから
「アプリをインストール」でアプリとして使えます（PWA対応済み・オフラインでも起動）。

---

## 開発

```bash
npm install
npm run serve     # http://localhost:8931
npm run verify    # 結線チェック → コントラスト → lint → テスト
```

ビルド工程はありません。`npm` は検査ツールのためだけに使います。
コードの約束事は [CLAUDE.md](CLAUDE.md) にまとめています。

| コマンド | 内容 |
|---|---|
| `npm run check` | HTMLとJSの結線ズレ（DOM id・onclick・i18nキー）を検出 |
| `npm run lint` | ESLint |
| `npm test` | Workerのユニットテスト + 実ブラウザのスモークテスト |
| `npm run icons` | コトラSVGからPWAアイコンを生成 |
| `npm run update-vendor` | 同梱しているsupabase-jsを更新 |

`vendor/` に supabase-js をバージョン固定で同梱しています。理由と更新手順は
[vendor/README.md](vendor/README.md) を参照してください。

---

## プライバシー・外部サービス

| 送信先 | 送るもの | 目的 |
|---|---|---|
| Supabase | 日記・単語帳・学習設定 | 保存（Row Level Securityで自分のデータのみアクセス可） |
| Cloudflare Worker → Gemini | 日記本文・英訳・調べた単語・発音の認識結果 | AI添削・発音アドバイス |
| Pollinations.ai | 単語帳に登録した**英単語**（URLに含む） | 単語カードのイラスト生成 |
| ブラウザの音声認識 | マイク音声 | 発音チェック（Chrome/Safariの実装に依存し、サーバー処理の場合がある） |

---

## 費用まとめ

| サービス | 費用 |
|---------|------|
| GitHub Pages | 無料 |
| Supabase | 無料（500MB） |
| Cloudflare Workers | 無料（1日10万リクエスト、KV 1日1000書き込み） |
| Gemini API | 無料枠 |
| **合計** | **¥0** |
