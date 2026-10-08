#!/usr/bin/env node
/**
 * 公開用フォルダ（_public/）を、リポジトリの置き場所（tools/layout.js の対応表）から組み立てる。
 *   node tools/build-public.js              … _public/ に作る
 *   node tools/build-public.js --out 場所    … 出力先を変える
 * GitHub Actions が公開の直前に自動で実行します（.github/workflows/pages.yml）。手元で確認したい時にも使えます。
 * 同じURLに2つのファイルが重なる場合や、対応表に無いフォルダがある場合、必須ファイルが無い場合は、エラーで止まります（＝公開されません）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { FEATURES } = require('./layout.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(ROOT, (i => (i >= 0 && argv[i + 1]) ? argv[i + 1] : '_public')(argv.indexOf('--out')));
const REQUIRED = ['index.html', 'data/spots.json', 'data/hotels.json', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml', 'robots.txt', '404.html'];
const errors = [];
let files = 0;

function exists(p) { return fs.existsSync(p); }
function put(srcAbs, publicRel) {
  const dst = path.join(OUT, publicRel);
  if (exists(dst)) { errors.push(`公開URLが重なっています: /${publicRel}（${path.relative(ROOT, srcAbs)}）`); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(srcAbs, dst, { recursive: true, errorOnExist: true, force: false });
}

if (OUT === ROOT || OUT === path.join(ROOT, 'site')) { console.error('✗ 出力先が危険な場所です: ' + OUT); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1) ルートの index.html / data / photo
if (exists(path.join(ROOT, 'index.html'))) put(path.join(ROOT, 'index.html'), 'index.html'); else errors.push('index.html がルートにありません');
if (exists(path.join(ROOT, 'data'))) put(path.join(ROOT, 'data'), 'data');
if (exists(path.join(ROOT, 'photo'))) put(path.join(ROOT, 'photo'), 'img');

// 2) site/ の中
const SITE = path.join(ROOT, 'site');
if (!exists(SITE)) errors.push('site/ フォルダがありません');
else for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {
  const abs = path.join(SITE, e.name);
  if (e.isDirectory() && (e.name === 'area' || e.name === 'feature' || e.name === 'root-files')) {
    for (const c of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'feature' && !c.isDirectory()) { errors.push(`site/feature/ にはフォルダだけを置いてください: ${c.name}`); continue; }
      if (e.name === 'area' && !c.isDirectory()) { errors.push(`site/area/ にはフォルダだけを置いてください: ${c.name}`); continue; }
      put(path.join(abs, c.name), c.name);
    }
  } else if (e.isDirectory() && (e.name === 'event' || e.name === 'season')) {
    put(abs, e.name);
  } else {
    errors.push(`site/${e.name} の置き場所が決まっていません（area / feature / event / season / root-files のどれかに入れてください）`);
  }
}

// 3) 必須ファイルの確認
for (const r of REQUIRED) if (!exists(path.join(OUT, r))) errors.push(`必須ファイルがありません: /${r}`);

// 4) 件数
(function count(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : files++; })(OUT);

if (errors.length) { console.error('✗ 公開用フォルダを作れませんでした:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`✓ ${path.relative(ROOT, OUT) || OUT}/ に ${files} ファイルを組み立てました`);
