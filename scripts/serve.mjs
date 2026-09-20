/** docs/ 를 그대로 띄우는 최소 정적 서버. PWA(서비스워커) 확인용. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs'));
const PORT = 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  const target = resolve(join(DOCS, path === '/' ? 'index.html' : path));

  // docs/ 바깥으로 빠져나가는 경로는 거부한다
  if (target !== DOCS && !target.startsWith(DOCS + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const buf = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('없음: ' + path);
  }
}).listen(PORT, () => console.log(`docs/ -> http://localhost:${PORT}`));
