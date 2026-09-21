// スモークテストの実行係。ローカルサーバを起動し、終わったら必ず落とす。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.PORT || 8931;
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn('node', ['node_modules/http-server/bin/http-server', '.', '-p', String(PORT), '-c-1', '--silent'], {
  stdio: 'ignore',
});

const stop = () => { try { server.kill('SIGTERM'); } catch {} };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

// サーバが立ち上がるまで待つ
let up = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(`${BASE}/index.html`); if (r.ok) { up = true; break; } } catch {}
  await sleep(250);
}
if (!up) { console.error('ローカルサーバを起動できませんでした'); stop(); process.exit(1); }

const smoke = spawn(process.execPath, [new URL('./smoke.mjs', import.meta.url).pathname], {
  stdio: 'inherit',
  env: { ...process.env, BASE_URL: BASE },
});
smoke.on('exit', code => { stop(); process.exit(code ?? 1); });
