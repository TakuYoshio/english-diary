// 同梱しているsupabase-jsを最新版に更新し、index.htmlの参照も合わせて書き換える。
// CDNの浮動参照に戻さないこと（vendor/README.md 参照）。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const work = mkdtempSync(join(tmpdir(), 'vendor-'));
console.log('npm pack @supabase/supabase-js ...');
execFileSync('npm', ['pack', '@supabase/supabase-js'], { cwd: work, stdio: 'inherit' });

const tgz = readdirSync(work).find(f => f.endsWith('.tgz'));
execFileSync('tar', ['xzf', tgz], { cwd: work });

const pkg = JSON.parse(readFileSync(join(work, 'package/package.json'), 'utf8'));
const distRel = pkg.jsdelivr || pkg.unpkg || 'dist/umd/supabase.js';
const version = pkg.version;
const outFile = `vendor/supabase-js-${version}.js`;

writeFileSync(outFile, readFileSync(join(work, 'package', distRel)));
console.log(`wrote ${outFile}`);

// 古い同梱ファイルを掃除
for (const f of readdirSync('vendor')) {
  if (/^supabase-js-.*\.js$/.test(f) && f !== `supabase-js-${version}.js`) {
    unlinkSync(join('vendor', f));
    console.log(`removed vendor/${f}`);
  }
}

const html = readFileSync('index.html', 'utf8');
const updated = html.replace(
  /<script src="vendor\/supabase-js-[^"]+\.js"><\/script>/,
  `<script src="${outFile}"></script>`
);
if (updated === html) {
  console.error('index.html の <script src="vendor/supabase-js-*.js"> を見つけられませんでした');
  process.exit(1);
}
writeFileSync('index.html', updated);
console.log(`index.html を ${outFile} に更新しました`);

// sw.js のアプリシェル一覧も合わせる
const sw = readFileSync('sw.js', 'utf8');
writeFileSync('sw.js', sw.replace(/'\.\/vendor\/supabase-js-[^']+\.js'/, `'./${outFile}'`));
console.log('sw.js を更新しました');

rmSync(work, { recursive: true, force: true });
console.log('\n次は npm run verify を実行し、実機でログインを確認してください。');
