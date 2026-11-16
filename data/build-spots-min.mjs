// data/spots.json から、投稿フォーム用の軽量版 data/spots.min.json を作る。
// このファイルと同じ data フォルダを基準に動くので、どこから実行しても動きます。
// 使い方: node data/build-spots-min.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('./spots.json', import.meta.url));
const DST = fileURLToPath(new URL('./spots.min.json', import.meta.url));

const spots = JSON.parse(readFileSync(SRC, 'utf-8'));
if (!Array.isArray(spots)) throw new Error('spots.json は配列である必要があります');

const seen = new Set();
const min = spots.map((s, i) => {
  if (!s.slug) throw new Error(`slug がありません: #${i} ${s.name}`);
  if (seen.has(s.slug)) throw new Error(`slug が重複しています: ${s.slug}`);
  seen.add(s.slug);
  return { slug: s.slug, name: s.name, area: s.area || '' };
});

writeFileSync(DST, JSON.stringify(min));
console.log(`spots.min.json: ${min.length}件`);
