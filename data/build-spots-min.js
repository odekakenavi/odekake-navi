// data/spots.json から、投稿フォーム用の軽量版 data/spots.min.json を作る。
// 使い方: node scripts/build-spots-min.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/spots.json';
const DST = 'data/spots.min.json';

const spots = JSON.parse(readFileSync(SRC, 'utf-8'));
if (!Array.isArray(spots)) throw new Error(`${SRC} は配列である必要があります`);

const seen = new Set();
const min = spots.map((s, i) => {
  if (!s.slug) throw new Error(`slug がありません: #${i} ${s.name}`);
  if (seen.has(s.slug)) throw new Error(`slug が重複しています: ${s.slug}`);
  seen.add(s.slug);
  return { slug: s.slug, name: s.name, area: s.area || '' };
});

writeFileSync(DST, JSON.stringify(min));
console.log(`${DST}: ${min.length}件`);
