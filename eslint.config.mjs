import js from '@eslint/js';
import globals from 'globals';
import { readFileSync } from 'node:fs';

// このプロジェクトはビルド工程を持たず、各スクリプトは1つのグローバルスコープを
// 共有して index.html から直接参照される。モジュール化はしない前提。
// グローバル一覧を手で管理すると必ず腐るので、実ファイルの最上位宣言から自動抽出する。
const APP_SCRIPTS = ['app.js', 'progress.js', 'mascot.js', 'fx.js', 'kotora-svg.js', 'kotora-speech.js'];

const appGlobals = Object.fromEntries(
  APP_SCRIPTS.flatMap(file => {
    const src = readFileSync(file, 'utf8');
    return [
      ...[...src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
      ...[...src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
    ];
  }).map(name => [name, 'writable'])
);

export default [
  { ignores: ['node_modules/**', 'docs/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        supabase: 'readonly', // CDNから読み込む supabase-js
        ...appGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 他ファイルやインラインonclickから参照される最上位の宣言は
      // 「未使用」「再宣言」に見えるため、関数内のローカル変数だけを検査する
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'off',
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.worker } },
  },
  {
    files: ['test/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['test/supabase-stub.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
];
