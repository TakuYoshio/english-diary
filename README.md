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

### 1. Supabase（DB）

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

3. Settings → API から **Project URL** と **anon key** をコピー

---

### 2. Gemini API（AI添削・無料）

1. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) にアクセス
2. **Create API Key** で発行（無料・登録不要）
3. `AIza...` で始まるキーをコピー

無料枠: 15 req/分、1日1,500リクエスト（個人利用で十分）

---

### 3. Google Cloud TTS（音声合成・無料枠あり）

1. [console.cloud.google.com](https://console.cloud.google.com) でプロジェクト作成
2. 「Cloud Text-to-Speech API」を有効化
3. APIs & Services → Credentials → **Create Credentials → API Key**
4. キーをコピー

無料枠: 月100万文字（日記1000件分相当）

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

### 5. ブラウザで設定

公開URLを開いて4つのキーを入力するだけ。  
Mac・iPhone・どの端末からも同じデータにアクセスできます。

> iPhoneはSafari → 共有 → **ホーム画面に追加** でアプリっぽく使えます。

---

## 費用まとめ

| サービス | 費用 |
|---------|------|
| GitHub Pages | 無料 |
| Supabase | 無料（500MB） |
| Gemini API | 無料（1日1,500回） |
| Google TTS | 無料（月100万文字） |
| **合計** | **¥0** |
# english-diary
