// アプリが読み書きする列が、Task/apply-all.sql に定義されているかを検査する。
//
// ビルド工程もORMも無いので、コードとDBスキーマのズレは本番で初めて分かる。
// 実際、image_url 列を使うコードを足したのにマイグレーションを適用し忘れ、
// 単語の追加と日記の保存が両方できなくなったことがある。
// リテラルで書かれた列名だけでも機械的に突き合わせれば、同じことは防げる。
//
// 動的に組み立てる列（スプレッドなど）は静的に追えないので検査しない。
// 完全ではないが、取りこぼすより何も見ないほうが悪い。
import { readFileSync } from 'node:fs';

const SQL = 'Task/apply-all.sql';
const STUB = 'test/supabase-stub.js';
const SOURCES = ['app.js', 'solo.js', 'progress.js'];

// ── スキーマ側: テーブルごとの列名を集める ────────────────────────────────
const sql = readFileSync(SQL, 'utf8');
const schema = {};

// create table public.X ( ... ) の中身から列名を拾う
for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, table, body] = m;
  schema[table] = new Set();
  for (const line of body.split('\n')) {
    const col = line.trim().match(/^(\w+)\s+\S/);
    // 制約行（primary key (...) など）は拾わない
    if (col && !/^(primary|foreign|unique|check|constraint)$/i.test(col[1])) {
      schema[table].add(col[1]);
    }
  }
}
// alter table public.X add column if not exists Y ...
for (const m of sql.matchAll(/alter table public\.(\w+)\s+add column if not exists (\w+)/g)) {
  (schema[m[1]] ||= new Set()).add(m[2]);
}

// ── コード側: テーブルごとに使っている列名を集める ────────────────────────
const used = {};   // { table: Map<column, 'file:line'> }
const note = (table, col, where) => {
  if (!col || /^\.\.\./.test(col)) return;
  ((used[table] ||= new Map())).set(col, used[table].get(col) || where);
};

for (const file of SOURCES) {
  const src = readFileSync(file, 'utf8');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  // sb.from('table') のあとに続くチェーンを、次の sb.from まで見る
  for (const m of src.matchAll(/sb\s*\.\s*from\(\s*'(\w+)'\s*\)/g)) {
    const table = m[1];
    const rest = src.slice(m.index, m.index + 900);
    const where = `${file}:${lineOf(m.index)}`;

    // .select('a,b,c') の列名（'*' は除く）
    for (const s of rest.matchAll(/\.select\(\s*'([^']*)'/g)) {
      if (s[1].trim() === '*') continue;
      s[1].split(',').forEach(c => note(table, c.trim(), where));
    }
    // .eq('col', ...) / .order('col', ...) / .gte / .lte / .not
    for (const f of rest.matchAll(/\.(?:eq|order|gte|lte|not)\(\s*'(\w+)'/g)) {
      note(table, f[1], where);
    }
    // .insert({...}) / .update({...}) のリテラルなキー
    for (const w of rest.matchAll(/\.(?:insert|update|upsert)\(\s*\{([^{}]*)\}/g)) {
      for (const k of w[1].matchAll(/(?:^|,)\s*(\w+)\s*:/g)) note(table, k[1], where);
    }
  }
}

// ── スタブ側: テストが「存在する」とみなしている列 ────────────────────────
// test/supabase-stub.js の COLUMNS はテスト時に本番と同じ厳しさで列を検証する
// 元データなので、これとSQLが食い違っていたらどちらかが古い。
// コードを静的に追うだけでは、row.image_url = ... のように後から代入する列を
// 拾えない（実際それで検出に失敗した）。明示された一覧どうしを突き合わせる。
const stubSrc = readFileSync(STUB, 'utf8');
const stubBlock = stubSrc.match(/const COLUMNS = \{([\s\S]*?)\n  \};/);
const stub = {};
if (stubBlock) {
  for (const m of stubBlock[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    stub[m[1]] = new Set([...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]));
  }
}

// ── 突き合わせ ────────────────────────────────────────────────────────────
const errors = [];

for (const [table, cols] of Object.entries(stub)) {
  if (!schema[table]) { errors.push(`テーブル '${table}' が ${SQL} に定義されていません`); continue; }
  for (const col of cols) {
    if (!schema[table].has(col)) {
      errors.push(`${STUB} は '${table}.${col}' を期待していますが ${SQL} にありません`);
    }
  }
}
for (const [table, cols] of Object.entries(schema)) {
  if (!stub[table]) { errors.push(`テーブル '${table}' が ${STUB} の COLUMNS にありません`); continue; }
  for (const col of cols) {
    if (!stub[table].has(col)) {
      errors.push(`${SQL} の '${table}.${col}' が ${STUB} の COLUMNS にありません（テストが本番より緩い）`);
    }
  }
}
for (const [table, cols] of Object.entries(used)) {
  if (!schema[table]) {
    errors.push(`テーブル '${table}' が ${SQL} に定義されていません`);
    continue;
  }
  for (const [col, where] of cols) {
    if (!schema[table].has(col)) {
      errors.push(`${where}: '${table}.${col}' が ${SQL} にありません`);
    }
  }
}

const tables = Object.keys(schema).sort();
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} 件: コードが使う列がスキーマにありません。`);
  console.error(`${SQL} に追加し、Supabaseでも実行してください。`);
  process.exit(1);
}
const stubCols = Object.values(stub).reduce((n, c) => n + c.size, 0);
console.log(`\nスキーマ同期: ${tables.length} テーブル / ${stubCols} 列 / ` +
  `${Object.values(used).reduce((n, m) => n + m.size, 0)} 箇所の列参照を検証`);
