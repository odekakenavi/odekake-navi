#!/usr/bin/env node
/**
 * 公開用フォルダ（_public/）の静的ページを、いまの data/spots.json から作り直して上書きする。
 *   node tools/refresh-static-pages.js --public _public
 *
 * GitHub Actions が公開の直前に自動で実行します（.github/workflows/pages.yml）。
 * → スマホで data/spots.json を更新するだけで、施設ページ・地域ページ・季節ページ・エリア特集・sitemap.xml が
 *   自動で最新になります（約1000ファイルをPCからアップする必要がなくなります）。
 *
 * やること:
 *   1) tools/build-static-pages.js で 施設/地域/季節ページ＋sitemap を一時フォルダに作る
 *   2) tools/build-area-pages.js で エリア特集（chiba/boso など）を作り、sitemap に合流
 *   2'') tools/build-event-pages.js --only momiji で 紅葉・いちょう特集（/event/momiji/）を作り、sitemap に追加
 *   2') tools/build-feature-pages.js で 目的別（/purpose/…）・雨の日・無料・赤ちゃん向けの特集ページを作り、sitemap に追加
 *   3) できたページで _public/ を上書き（リポジトリ内のファイルは一切書き換えない）
 *   4) 既存sitemapのうち都道府県フォルダ以外（event/ purpose/ free/ など）のURLを合流し、
 *      sitemap.xml から「ファイルが実在しないURL」と「都道府県フォルダ内の古いURL（いまのデータでは作られないもの）」を外す
 * 生成ツールがエラーになった場合は、ここで止まる（＝公開されない）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const PUB = path.resolve(ROOT, (i => (i >= 0 && argv[i + 1]) ? argv[i + 1] : '_public')(argv.indexOf('--public')));
const SITE = 'https://odekakenavi.github.io/odekake-navi/';
const PREFS = ['tokyo', 'kanagawa', 'saitama', 'chiba', 'ibaraki', 'tochigi', 'gunma', 'yamanashi', 'shizuoka', 'fukushima', 'nagano'];

if (!fs.existsSync(path.join(PUB, 'sitemap.xml'))) { console.error('✗ ' + PUB + '/sitemap.xml がありません。先に build-public.js を実行してください'); process.exit(1); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'odekake-gen-'));
const GEN = path.join(TMP, 'gen'), AREA = path.join(TMP, 'area'), FEAT = path.join(TMP, 'feature'), EVT = path.join(TMP, 'event');
const run = (script, args) => execFileSync(process.execPath, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

try {
  const idx = path.join(ROOT, 'index.html'), spots = path.join(ROOT, 'data', 'spots.json');
  console.log('・施設/地域/季節ページを生成中…');
  run('build-static-pages.js', ['--index', idx, '--spots', spots, '--out', GEN]);
  console.log('・エリア特集ページを生成中…');
  run('build-area-pages.js', ['--index', idx, '--spots', spots, '--sitemap', path.join(GEN, 'sitemap.xml'), '--out', AREA]);
  console.log('・目的別／雨の日／無料／赤ちゃん向けの特集ページを生成中…');
  run('build-feature-pages.js', ['--index', idx, '--spots', spots, '--out', FEAT]);
  console.log('・紅葉・いちょう特集（/event/momiji/）を生成中…');
  run('build-event-pages.js', ['--index', idx, '--spots', spots, '--only', 'momiji', '--out', EVT]);
} catch (e) {
  console.error('✗ 静的ページの生成に失敗しました（data/spots.json や index.html の形が崩れている可能性）。公開を中止します。');
  process.exit(1);
}

// 生成されたファイル一覧（sitemap.xml は最後に別扱い）
const generated = new Set();
function overlay(srcRoot, also) {
  (function rec(rel) {
    for (const e of fs.readdirSync(path.join(srcRoot, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { rec(r); continue; }
      if (r === 'sitemap.xml') continue;
      const dst = path.join(PUB, r);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(srcRoot, r), dst);
      generated.add(r);
      if (also) also.add(r);
    }
  })('');
}
overlay(GEN);
overlay(AREA);
const featurePages = new Set(); overlay(FEAT, featurePages);
overlay(EVT, featurePages); // 紅葉特集：data/spots.json の events/eventInfo から毎回作る（他のイベント特集は site/event/ のまま）

// sitemap の整理
const fileFor = u => { const p = decodeURI(u.replace(/&amp;/g, '&').slice(SITE.length)); return p === '' ? 'index.html' : (p.endsWith('/') ? p + 'index.html' : p); };
let sm = fs.readFileSync(path.join(AREA, 'sitemap.xml'), 'utf8');
// 既存sitemapから、生成ツールが作らないURL（event/ purpose/ free/ rainy-day/ など都道府県フォルダ以外）を合流
{
  const have = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decodeURI(m[1])));
  const old = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  const extra = [...old.matchAll(/<url>[\s\S]*?<\/url>\n?/g)].map(m => m[0]).filter(u => {
    const l = (u.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!l || have.has(decodeURI(l)) || !l.startsWith(SITE)) return false;
    const first = decodeURI(l.slice(SITE.length)).split('/')[0];
    return first !== '' && !PREFS.includes(first);
  });
  if (extra.length) sm = sm.replace('</urlset>', extra.join('') + '</urlset>');
}
// 特集ページ（purpose/ free/ rainy-day/ baby/）は、sitemap に無ければ追加する（新しく増えたジャンルも自動で載る）
{
  const have = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decodeURI(m[1])));
  let add = '';
  for (const f of [...featurePages].sort()) {
    const u = SITE + f.replace(/index\.html$/, '');
    if (!have.has(decodeURI(u))) add += `<url>\n<loc>${u}</loc>\n<changefreq>weekly</changefreq>\n<priority>0.8</priority>\n</url>\n`;
  }
  if (add) sm = sm.replace('</urlset>', add + '</urlset>');
}
const dropped = { missing: [], stale: [] };
sm = sm.replace(/<url>[\s\S]*?<\/url>\n?/g, block => {
  const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
  if (!loc || !loc.startsWith(SITE)) return block;
  const f = fileFor(loc);
  if (!fs.existsSync(path.join(PUB, f))) { dropped.missing.push(decodeURI(loc.slice(SITE.length))); return ''; }
  if (PREFS.includes(f.split('/')[0]) && !generated.has(f)) { dropped.stale.push(decodeURI(loc.slice(SITE.length))); return ''; }
  return block;
});
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), sm);
fs.rmSync(TMP, { recursive: true, force: true });

const n = (sm.match(/<loc>/g) || []).length;
console.log(`✓ 静的ページ ${generated.size} ファイルを最新データで作り直しました（sitemap: ${n} URL）`);
const report = [];
if (dropped.missing.length) report.push(`⚠ ページが存在しないため sitemap から外したURL（${dropped.missing.length}件）:\n  - ` + dropped.missing.join('\n  - '));
if (dropped.stale.length) report.push(`⚠ いまのデータでは作られない古いURLのため sitemap から外したURL（${dropped.stale.length}件・ファイル自体は残しています）:\n  - ` + dropped.stale.join('\n  - '));
if (report.length) console.log(report.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 静的ページの自動生成\n- 作り直したファイル: ${generated.size}\n- sitemap のURL数: ${n}\n` +
    (report.length ? '\n```\n' + report.join('\n') + '\n```\n' : ''));
}
