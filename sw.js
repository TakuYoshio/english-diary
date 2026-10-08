'use strict';

// アプリシェル（HTML/CSS/JS/アイコン）だけをキャッシュする素朴なService Worker。
// SupabaseとCloudflare Workerへの通信は必ずネットワークに行かせる（学習データと
// AI応答をキャッシュすると古い内容が出たり、他ユーザーのデータが混ざる危険がある）。
// CACHE_VERSION を上げると古いキャッシュは activate 時に削除される。
const CACHE_VERSION = 'v1';
const CACHE_NAME = `english-diary-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './vendor/supabase-js-2.116.0.js',
  './style.css',
  './fx.js',
  './kotora-svg.js',
  './app.js',
  './progress.js',
  './mascot.js',
  './kotora-speech.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './character/kotora.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    // 1つでも失敗すると全体が失敗するaddAllは避け、取れたものだけ入れる
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 同一オリジンのアプリシェル以外（Supabase・Worker・画像生成・フォント）は素通し
  if (url.origin !== self.location.origin) return;

  // network-first（キャッシュへフォールバック）。
  // stale-while-revalidate だと利用者が常に1つ前のバージョンを使い続けることになり、
  // 不具合修正を配っても次の次の起動まで届かない。学習データを扱うアプリでは
  // 「オンラインなら必ず最新」を優先し、キャッシュはオフライン用の保険に徹する。
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || Promise.reject(new Error('offline'))))
  );
});
