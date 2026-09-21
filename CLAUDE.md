# CLAUDE.md

英語日記アプリ。日本語で書いた日記を自分で英訳し、AIの添削・シャドーイング・
発音チェックで英語を学ぶ。GitHub Pagesでホストする静的サイト。

## 最初に知っておくこと

**ビルド工程は無い。** バンドラもトランスパイラも使わない。`index.html` が
スクリプトを直接読み込み、各ファイルは1つのグローバルスコープを共有する。
関数はグローバルに定義され、HTMLからは `onclick="..."` で直接呼ばれる。
`package.json` は検査ツール（lint・テスト）のためだけにあり、アプリ自体は
依存ゼロで動く。この構成は `docs/要件定義書.md` の非機能要件（可搬性）。

```
npm run verify   # 結線チェック → コントラスト → lint → テスト（変更後は必ず）
npm run serve    # http://localhost:8931
npm test         # Workerのユニットテスト + 実ブラウザのスモークテスト
```

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | 全DOM。タブは `<section id="tab-*" class="tab">`、モーダルは `.modal-overlay` |
| `app.js` | i18n・認証・日記6ステップ・AI呼び出し・音声・単語帳・クイズ |
| `progress.js` | ストリーク・XP・レベル・バッジ・カレンダー・統計 |
| `mascot.js` | コトラの状態機械（mood / tier / stage） |
| `kotora-svg.js` | コトラのインラインSVG（表情8種） |
| `kotora-speech.js` | `KOTORA_LINES`（セリフ辞書）と吹き出し |
| `fx.js` | 紙吹雪・XP演出・カウントアップ |
| `style.css` | デザイントークンと全コンポーネント |
| `sw.js` / `manifest.json` | PWA |
| `worker/src/index.js` | Gemini中継のCloudflare Worker（APIキーを隠す・認証・レート制限） |
| `vendor/` | 同梱したsupabase-js（CDNの浮動参照は使わない。`vendor/README.md`） |
| `Task/*.sql` | DBマイグレーション。**Supabaseダッシュボードで手動実行する** |

読み込み順（`index.html` 末尾）: supabase → `fx.js` → `kotora-svg.js` →
`app.js` → `progress.js` → `mascot.js` → `kotora-speech.js`。
新しいスクリプトは依存先より後に置く。

## 守ること

- **既存の名前を変えない。** CSS変数名・関数名・mood名・data属性は追加のみ。
  複数ファイルがグローバル経由で参照し合っているため、改名は静かに壊れる。
- **文言の置き場所を混ぜない。** UIの文言は `app.js` の `TRANSLATIONS`（ja/en
  両方必須）。コトラのセリフは `kotora-speech.js` の `KOTORA_LINES`。
- **コーラルのパレットを保つ。** 新しいUIも `--accent` / `--secondary` /
  `--gold` から組む。白文字を載せる面だけは `--accent-on-white-text` 等の
  コントラスト確保済みトークンを使う（`scripts/check-contrast.mjs` が検査）。
- **モバイルファースト。** 768px以下はボトムタブバー。
- **`prefers-reduced-motion`。** 新しいアニメーションは既存のガード
  （`style.css` に5箇所）に必ず追記する。
- **運用費ゼロ。** すべて無料枠で動かす。ローカル計算で済むものにAIを使わない。
- **日付は `todayISO()` を使う。** `toISOString()` はUTCに変換するため、
  JSTでは朝9時前の日記が前日になる。
- **HTMLに差し込む値は `escapeHtml()` を通す。** 属性値も同様。
- **Supabaseの `{ data, error }` の `error` を捨てない。** 握り潰すと
  読み込み失敗が「データが空」として表示される。

## 検査ツール

ビルド工程が無いぶん、壊れたことに気づく仕組みを別に用意している。

- `scripts/check-wiring.mjs` — `getElementById` の対象がHTMLに存在するか、
  インラインの `onclick` に対応する関数があるか、i18nキーがja/en両方に
  あるかを検査する。HTMLとJSのズレは実行するまで気づけないため。
- `scripts/check-contrast.mjs` — 主要な文字色がWCAG AA（4.5:1）を満たすか。
- `test/worker.test.mjs` — Workerの検証・レート制限ロジック（fetchとKVをスタブ）。
- `test/smoke.mjs` — Supabaseをスタブした実ブラウザで主要タブを一巡し、
  コンソールエラー・XSS・アクセシビリティ・パフォーマンスの回帰を見る。

## 手作業が必要なもの

コードからは実行できない。変更したら依頼すること。

- `Task/*.sql` を Supabase ダッシュボードの SQL Editor で実行
- Worker のデプロイ: `cd worker && npx wrangler deploy`
- KVネームスペースの作成: `npx wrangler kv namespace create RATE_LIMIT`
  （IDを `worker/wrangler.toml` に貼る。未設定だとレート制限が無効）
- `npx wrangler secret put GEMINI_API_KEY`

## 今後の計画

`docs/roadmap-features.md` に次の4機能の仕様がある（②③④はAI不要の
ローカル計算で完結する）。`Task/memo` は利用者の要望メモ。
