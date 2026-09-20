/**
 * web/index.html + src/engine.mjs + data/*.json 을 두 가지로 굽는다.
 *
 *   dist/rocket-counter.html   단일 파일 — Artifact 게시용 / 더블클릭 오프라인용
 *   docs/                      PWA 한 벌 — GitHub Pages 에 그대로 올리면 설치형 앱
 *
 * web/index.html 은 Artifact 규격(문서 뼈대 없이 본문만)으로 쓰여 있으므로
 * PWA 쪽은 여기서 온전한 HTML 문서로 감싼다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;

const APP_NAME = '로켓단 대응기';
const THEME = '#C8102E';
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

// ---------------------------------------------------------------- 데이터 압축
const pokemon = data('pokemon.json').filter((p) => p.fast.length && p.charged.length);
const moves = data('moves.json');

// 배열로 압축 — 키 이름 반복을 없애 파일 크기를 절반 이하로 줄인다
const packed = {
  types: data('types.json'),
  battle: data('battle.json'),
  grunts: data('grunts.json'),
  rocket: data('rocket.json'),
  moves: Object.fromEntries(Object.entries(moves).map(([k, m]) =>
    [k, [m.ko, m.en, m.type, m.power, m.energy, m.duration, m.kind]])),
  pokemon: pokemon.map((p) =>
    [p.id, p.ko, p.en, p.dex, p.atk, p.def, p.sta, p.types, p.fast, p.charged, p.cls, p.mega ? 1 : 0]),
};

const engine = readFileSync(join(ROOT, 'src', 'engine.mjs'), 'utf8').replace(/^export /gm, '');
const body = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8')
  .replace('__ENGINE__', () => engine)
  .replace('__DATA__', () => JSON.stringify(packed).replace(/<\//g, '<\\/'));

// ------------------------------------------------- 1) 단일 파일 (Artifact/오프라인)
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist', 'rocket-counter.html'), body);
console.log('  dist/rocket-counter.html'.padEnd(32), kb(body));

// ------------------------------------------------------------------ 2) PWA 한 벌
const DOCS = join(ROOT, 'docs');
mkdirSync(DOCS, { recursive: true });

// web/index.html 은 <title>로 시작한다. 그 앞부분을 head 로 끌어올린다.
const pwaHead = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="포켓몬GO 로켓단 대응 포켓몬을 찾아주는 앱">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="${THEME}">
<link rel="icon" type="image/png" href="favicon-32.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${APP_NAME}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>
  /* Artifact 뼈대가 해 주던 일을 여기서 직접 한다 */
  :root{ padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px); }
  html{ -webkit-text-size-adjust:100%; }
  body{ margin:0; }
  img{ max-width:100%; }
  [hidden]{ display:none !important; }
</style>
</head>
<body>
`;

const pwaTail = `
<script>
/* 서비스워커 — 오프라인 동작과 홈화면 설치를 담당 */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 기능만 빠진다 */ });
  });
}
</script>
</body>
</html>
`;

const pwaHtml = pwaHead + body + pwaTail;
writeFileSync(join(DOCS, 'index.html'), pwaHtml);

const manifest = {
  name: APP_NAME,
  short_name: '로켓단',
  description: '포켓몬GO 로켓단 대응 포켓몬을 찾아주는 앱',
  lang: 'ko',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#F5F4F2',
  theme_color: THEME,
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(DOCS, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const sw = `/* 로켓단 대응기 서비스워커 — 빌드 ${BUILD} */
const CACHE = 'rocket-counter-${BUILD}';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 페이지 요청은 네트워크 우선 — 온라인이면 항상 최신 버전을 받는다
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // 나머지(아이콘·폰트 등)는 캐시 우선, 없으면 받아서 캐시에 넣는다
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit)),
  );
});
`;
writeFileSync(join(DOCS, 'sw.js'), sw);
writeFileSync(join(DOCS, '.nojekyll'), '');

console.log('  docs/index.html'.padEnd(32), kb(pwaHtml));
console.log('  docs/manifest.webmanifest, sw.js, .nojekyll');
console.log(`\n포켓몬 ${packed.pokemon.length}종 · 기술 ${Object.keys(packed.moves).length}개 · 빌드 ${BUILD}`);
