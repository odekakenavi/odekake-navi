#!/usr/bin/env node
/**
 * 公開用フォルダ（_public/）を、リポジトリの置き場所（tools/layout.js の対応表）から組み立てる。
 *   node tools/build-public.js              … _public/ に作る
 *   node tools/build-public.js --out 場所    … 出力先を変える
 * GitHub Actions が公開の直前に自動で実行します（.github/workflows/pages.yml）。手元で確認したい時にも使えます。
 * 同じURLに2つのファイルが重なる場合や、対応表に無いフォルダがある場合、必須ファイルが無い場合は、エラーで止まります（＝公開されません）。
 *
 * 施設画像：正規の置き場所は photo/spots/（→ /img/spots/）。data/spots.json の "image": "img/spots/xxx.jpg" と対応します。
 *   ・旧い置き場所（ルートの img/spots/、site/img/spots/）にだけある画像は、spots.json が参照しているものに限り、足りない分だけ補います（photo/spots/ が常に優先。重なってエラーにはしません）。
 *   ・spots.json が参照する画像が公開先に無い場合は警告します。--strict-images を付けると、エラーで止めます。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { FEATURES } = require('./layout.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(ROOT, (i => (i >= 0 && argv[i + 1]) ? argv[i + 1] : '_public')(argv.indexOf('--out')));
const REQUIRED = ['index.html', 'data/spots.json', 'data/hotels.json', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml', 'robots.txt', '404.html'];
const STRICT_IMAGES = argv.includes('--strict-images');
const LEGACY_IMG_DIRS = ['img/spots', 'site/img/spots']; // 旧い置き場所（photo/spots/ に無い画像だけ補う）
const errors = [];
const warnings = [];
const imgStat = { refs: 0, fromPhoto: 0, fromLegacy: 0, missing: 0 };
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
  } else if (e.isDirectory() && e.name === 'img') {
    // site/img/spots/ は旧い画像置き場。ここでは公開せず、下の「施設画像の確認」で必要な分だけ補う
  } else {
    errors.push(`site/${e.name} の置き場所が決まっていません（area / feature / event / season / root-files のどれかに入れてください）`);
  }
}

// 2b) 施設画像の確認：data/spots.json が参照するローカル画像が、公開先（_public/img/spots/ など）にあるか
(function checkSpotImages() {
  const spotsFile = path.join(ROOT, 'data', 'spots.json');
  if (!exists(spotsFile)) return; // data/spots.json が無い場合は必須ファイルの確認でエラーになる
  let spots;
  try { spots = JSON.parse(fs.readFileSync(spotsFile, 'utf8')); } catch (e) { errors.push('data/spots.json を JSON として読めません: ' + e.message); return; }
  if (!Array.isArray(spots)) return;
  const seen = new Set(), missing = [], filled = [], differ = [];
  for (const s of spots) {
    const im = s && typeof s.image === 'string' ? s.image.trim() : '';
    if (!im || /^(https?:)?\/\/|^data:|^\//.test(im)) continue; // 外部URL・絶対パスは対象外（index.html の spotImageSrc と同じ判定）
    const rel = path.posix.normalize(im.replace(/^\.\//, ''));
    if (rel.split('/').includes('..')) { errors.push(`spots.json の画像パスが不正です: ${im}（${s.slug || s.name}）`); continue; }
    if (seen.has(rel)) continue;
    seen.add(rel); imgStat.refs++;
    const dst = path.join(OUT, ...rel.split('/'));
    const legacyName = rel.startsWith('img/spots/') ? rel.slice('img/spots/'.length).split('/') : null;
    const legacy = legacyName ? LEGACY_IMG_DIRS.map(d => path.join(ROOT, ...d.split('/'), ...legacyName)).filter(exists) : [];
    if (exists(dst)) {
      imgStat.fromPhoto++;
      for (const l of legacy) if (!fs.readFileSync(l).equals(fs.readFileSync(dst))) differ.push(`${path.relative(ROOT, l)} は photo/spots/ の同名ファイルと内容が違います（photo/spots/ を公開）`);
    } else if (legacy.length) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(legacy[0], dst);
      imgStat.fromLegacy++; filled.push(`${path.relative(ROOT, legacy[0])} → /${rel}`);
    } else {
      imgStat.missing++; missing.push(`/${rel}（${s.slug || s.name}）` + (legacyName ? `← photo/spots/${legacyName.join('/')} に置いてください` : ''));
    }
  }
  if (filled.length) warnings.push(`旧い置き場所の画像を公開先に補いました（${filled.length}件）。photo/spots/ へ移すと、この警告は出なくなります:\n  - ` + filled.join('\n  - '));
  if (differ.length) warnings.push(`同名で内容が違う画像があります（${differ.length}件）:\n  - ` + differ.join('\n  - '));
  if (missing.length) {
    const msg = `spots.json が参照している画像が見つかりません（${missing.length}件）:\n  - ` + missing.join('\n  - ');
    if (STRICT_IMAGES) errors.push(msg); else warnings.push(msg);
  }
})();

// 3) 必須ファイルの確認
for (const r of REQUIRED) if (!exists(path.join(OUT, r))) errors.push(`必須ファイルがありません: /${r}`);

// 4) 件数
(function count(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : files++; })(OUT);

if (errors.length) { console.error('✗ 公開用フォルダを作れませんでした:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`✓ ${path.relative(ROOT, OUT) || OUT}/ に ${files} ファイルを組み立てました`);
console.log(`✓ 施設画像: spots.json の参照 ${imgStat.refs} 件 → 配置済み ${imgStat.fromPhoto + imgStat.fromLegacy} 件（photo/spots ${imgStat.fromPhoto}・旧置き場所から補完 ${imgStat.fromLegacy}）／未配置 ${imgStat.missing} 件`);
if (warnings.length) console.warn('⚠ ' + warnings.join('\n⚠ '));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 公開用フォルダの組み立て\n- 施設画像: 参照 ${imgStat.refs} / 配置済み ${imgStat.fromPhoto + imgStat.fromLegacy} / 未配置 ${imgStat.missing}\n` + (warnings.length ? '\n```\n' + warnings.join('\n') + '\n```\n' : ''));
}
