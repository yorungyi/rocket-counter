/**
 * PWA 아이콘 생성. SVG 한 장을 그려 필요한 크기의 PNG로 굽는다.
 *
 * maskable 아이콘은 안드로이드가 원형·둥근사각 등으로 잘라내므로
 * 바깥 20%를 여백으로 비워 두는 "안전 영역" 규칙을 지킨다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');
mkdirSync(OUT, { recursive: true });

const CRIMSON = '#C8102E';

/** @param {number} inset 0~1. 글자 주변으로 비워 둘 비율 (maskable 안전영역용) */
const svg = (inset, rounded) => {
  const S = 512;
  const r = rounded ? 112 : 0;
  // 안전영역을 고려한 글자 크기·위치
  const scale = 1 - inset * 2;
  const fontSize = 340 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${r}" ry="${r}" fill="${CRIMSON}"/>
  <g transform="translate(${S / 2} ${S / 2}) skewX(-8)">
    <text x="0" y="0" fill="#FFFFFF" font-size="${fontSize}"
          font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"
          text-anchor="middle" dominant-baseline="central">R</text>
  </g>
</svg>`;
};

const jobs = [
  // any 아이콘: 모서리를 둥글게 해 그대로 써도 보기 좋게
  { file: 'icon-192.png', size: 192, svg: svg(0.06, true) },
  { file: 'icon-512.png', size: 512, svg: svg(0.06, true) },
  // maskable: 잘려도 글자가 살아남도록 여백을 크게, 바탕은 꽉 채움
  { file: 'icon-maskable-512.png', size: 512, svg: svg(0.20, false) },
  // 브라우저 탭 / 사파리 홈화면
  { file: 'favicon-32.png', size: 32, svg: svg(0.04, true) },
  { file: 'apple-touch-icon.png', size: 180, svg: svg(0.10, false) },
];

for (const j of jobs) {
  const buf = await sharp(Buffer.from(j.svg)).resize(j.size, j.size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, j.file), buf);
  console.log(`  docs/${j.file}`.padEnd(30), `${j.size}px  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`아이콘 ${jobs.length}개 생성`);
