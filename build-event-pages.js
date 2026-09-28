#!/usr/bin/env node
// おでかけナビ イベント特集ページ生成ツール（ハロウィンなど）
// tools/build-static-pages.js と同じテンプレート（青ヘッダー・パンくず・カード）で /event/{slug}/index.html を作る。
//
// 使い方（リポジトリ直下で実行）:
//   node tools/build-event-pages.js --out _build
//   node tools/build-event-pages.js --out _build --sitemap _build/sitemap.xml   … sitemap.xml に event ページのURLを追記（重複しない）
//
// 施設データ: index.html と同じフォルダの data/spots.json（--spots <パス> で変更可）。
//   spots.json の各施設の events（["ハロウィン"]）と eventInfo["ハロウィン"]（start/end/periodLabel/note/type）を読む。
//   type が "photo" の施設は「装飾・フォトスポット」、それ以外は「イベント」の区分に並べる。
//   施設ページのURLは index.html の SLUG_OVERRIDES（URL確定済み）から取る。未登録の施設はアプリ（?spot=施設名）へリンクする。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://odekakenavi.github.io/odekake-navi/';
const BASE = '/odekake-navi/';
const argv = process.argv.slice(2);
function opt(name, def) { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : def; }
const INDEX_PATH = opt('index', 'index.html');
const OUT_DIR = opt('out', '_build');
const SPOTS_JSON = opt('spots', null);
const SITEMAP = opt('sitemap', null);

const EVENTS = [
  { key: 'ハロウィン', slug: 'halloween', emoji: '🎃', label: 'ハロウィンイベント', year: 2026 },
];

// ---- index.html から施設URLの表（SLUG_OVERRIDES）と spotSlug を取り出す（改行あり・圧縮どちらの index.html でも動く）
function extractMainScript(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = '';
  while ((m = re.exec(html))) if (m[1].length > best.length) best = m[1];
  return best;
}
function loadApp(indexPath) {
  const src = extractMainScript(fs.readFileSync(indexPath, 'utf8'));
  const a = src.search(/const SPOTS\s*=\s*window\.__ODEKAKE_DATA__/);
  if (a < 0) throw new Error("index.html に 'const SPOTS = window.__ODEKAKE_DATA__' が見つかりません");
  const b0 = src.indexOf('function spotBySlug');
  if (b0 < 0) throw new Error('index.html に function spotBySlug が見つかりません');
  const bEnd = src.indexOf('}', b0) + 1;
  const jsonPath = SPOTS_JSON || path.join(path.dirname(path.resolve(indexPath)), 'data', 'spots.json');
  if (!fs.existsSync(jsonPath)) throw new Error('施設データが見つかりません: ' + jsonPath);
  const sandbox = { window: { __ODEKAKE_DATA__: { spots: JSON.parse(fs.readFileSync(jsonPath, 'utf8')) } } };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(a, bEnd) + '\nthis.__app = { SPOTS, SLUG_OVERRIDES, spotSlug };', sandbox, { filename: 'index.html(data)' });
  return sandbox.__app;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function pyJson(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(pyJson).join(', ') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ': ' + pyJson(v[k])).join(', ') + '}';
  return JSON.stringify(v);
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function clip(t, n) { const a = Array.from(t); return a.length > n ? a.slice(0, n).join('') + '…' : t; }
const md = iso => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${Number(m[1])}/${Number(m[2])}` : ''; };

// build-static-pages.js の CSS_SEASON と同じ + イベント用の追加分
const CSS = String.raw`
  body{font-family:"Noto Sans JP",sans-serif; background:#FBF7EF; color:#2B2620; margin:0; padding:0; line-height:1.7;}
  .wrap{max-width:640px; margin:0 auto; padding:20px 18px 60px;}
  header.site{padding:14px 18px; background:#3E8FB0;}
  header.site a{color:#fff; text-decoration:none; font-weight:700;}
  nav.breadcrumb{font-size:13px; color:#6b6258; margin:16px 0 10px;}
  nav.breadcrumb a{color:#3E8FB0; text-decoration:none;}
  h1{font-size:22px; margin:6px 0 4px;}
  .period-badge{display:inline-block; background:#F4B740; color:#2B2620; border-radius:20px; padding:3px 14px; font-size:13px; margin-bottom:6px; font-weight:700;}
  .count-badge{display:inline-block; background:#E2603A; color:#fff; border-radius:20px; padding:3px 12px; font-size:13px; margin-bottom:14px; margin-left:6px;}
  .intro{margin:10px 0 20px; font-size:14px; color:#4a443c;}
  .season-nav{display:flex; gap:8px; margin:10px 0 22px; flex-wrap:wrap;}
  .season-nav a{flex:1; min-width:70px; text-align:center; background:#fff; border:1px solid #eadfca; border-radius:10px; padding:8px 4px; text-decoration:none; color:#2B2620; font-size:13px; font-weight:700;}
  .season-nav a.current{border-color:#E2603A; background:#FFF1E6;}
  .region-block{margin:26px 0;}
  .region-title{font-size:16px; font-weight:400; border-left:4px solid #F4B740; padding-left:8px; margin:0 0 2px;}
  .region-title a{color:#2B2620; text-decoration:none;}
  .region-sub{font-size:12px; color:#928a7c; margin:0 0 10px 12px;}
  .facility-list{list-style:none; margin:0; padding:0;}
  .facility-list li{margin-bottom:10px;}
  .facility-list a{display:block; background:#fff; border:1px solid #eadfca; border-radius:10px; padding:12px 14px; text-decoration:none; color:#2B2620; font-size:14px; font-weight:600;}
  .facility-list a .fa-area{display:block; font-weight:400; font-size:12px; color:#928a7c; margin-top:2px;}
  .facility-list a .ev-period{display:inline-block; background:#FFE7CC; color:#A34700; border-radius:20px; padding:1px 10px; font-size:12px; font-weight:700; margin-top:6px;}
  .facility-list a .ev-note{display:block; font-weight:400; font-size:12.5px; color:#4a443c; margin-top:6px; line-height:1.6;}
  .notice{background:#FFF6EA; border:1px solid #F3C89B; border-radius:10px; padding:10px 12px; font-size:12.5px; color:#4a443c; margin:0 0 18px;}
  .cta{display:block; text-align:center; background:#3E8FB0; color:#fff !important; text-decoration:none; font-weight:700; padding:14px; border-radius:12px; margin:26px 0 10px;}
  footer{font-size:12px; color:#928a7c; text-align:center; padding:24px 18px 40px;}
  footer a{color:#3E8FB0;}
`;
const FOOTER = `<footer>
  データ出典・運営者情報・免責事項は<a href="${BASE}">おでかけナビ トップページ</a>の「よくある質問」「運営者について」でご確認いただけます。<br>
  © おでかけナビ
</footer>
</body>
</html>
`;
function head(title, description, canonical, jsonlds) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="おでかけナビ">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${jsonlds.map(j => `<script type="application/ld+json">${pyJson(j)}</script>`).join('\n')}

<style>${CSS}</style>
</head>
<body>
<header class="site"><a href="${BASE}">🧭 おでかけナビ</a></header>
<div class="wrap">
`;
}
const breadcrumbLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => Object.assign({ '@type': 'ListItem', position: i + 1, name: it[0] }, it[1] ? { item: it[1] } : {})) });
const itemListLd = (name, items) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length, itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], url: it[1] })) });

function eventPage(ev, app) {
  const url = `${SITE}event/${ev.slug}/`;
  const items = app.SPOTS.filter(s => (s.events || []).includes(ev.key) && s.eventInfo && s.eventInfo[ev.key]).map(s => {
    const pinned = Object.prototype.hasOwnProperty.call(app.SLUG_OVERRIDES, s.name);
    return { spot: s, info: s.eventInfo[ev.key], href: pinned ? `${BASE}${app.spotSlug(s)}/` : `${BASE}?spot=${encodeURIComponent(s.name)}`, abs: pinned ? `${SITE}${app.spotSlug(s)}/` : null };
  }).sort((a, b) => cmp(a.info.start || '', b.info.start || '') || cmp(a.spot.name, b.spot.name));
  if (!items.length) return null;
  const starts = items.map(i => i.info.start).filter(Boolean).sort();
  const ends = items.map(i => i.info.end).filter(Boolean).sort();
  const period = starts.length && ends.length ? `${md(starts[0])}〜${md(ends[ends.length - 1])}` : `${ev.year}年`;
  const title = `【${ev.year}】子連れ${ev.label}｜関東の遊園地・フォトスポット｜おでかけナビ`;
  const description = clip(`${ev.year}年の${ev.key}を子どもと楽しめる関東のおでかけ先を${items.length}件掲載。開催期間・仮装の情報つき。`, 120);
  const groups = [
    { title: `${ev.emoji} ${ev.label}`, sub: '仮装・ショー・お菓子など、期間中に開催されるイベントです', list: items.filter(i => i.info.type !== 'photo') },
    { title: '📸 装飾・フォトスポット', sub: 'ハロウィン装飾やライトアップ、映像ショーを楽しめる場所です', list: items.filter(i => i.info.type === 'photo') },
  ].filter(g => g.list.length);
  const ld1 = breadcrumbLd([['おでかけナビ', SITE], [ev.label]]);
  const ld2 = itemListLd(`${ev.year}年 子連れ${ev.label}一覧`, items.filter(i => i.abs).map(i => [i.spot.name, i.abs]));
  let h = head(title, description, url, [ld1, ld2]);
  h += `<nav class="breadcrumb"><a href="${SITE}">おでかけナビ</a> ／ ${esc(ev.label)}</nav>
<div class="period-badge">${period}</div>
<div class="count-badge">${items.length}件掲載</div>
<h1>${ev.emoji} 【${ev.year}】子連れ${esc(ev.label)}</h1>
<p class="intro">「おでかけナビ」に登録されているスポットの中から、${ev.year}年の${esc(ev.key)}に楽しめる関東のおでかけ先をまとめました。開催が確認できた施設から順に掲載しています。</p>
<div class="season-nav"><a class="season-nav-item current" href="${BASE}event/${ev.slug}/">${ev.emoji} ${esc(ev.key)}</a><a class="season-nav-item" href="${BASE}season/autumn/">🍁 秋のお出かけ</a></div>
<div class="notice">開催期間・仮装のルール・料金は変更になることがあります。お出かけ前に必ず公式サイトで最新情報をご確認ください。</div>
${groups.map((g, i) => `<div class="region-block" id="group-${i + 1}"><h2 class="region-title">${g.title}（${g.list.length}件）</h2><div class="region-sub">${g.sub}</div><ul class="facility-list">${g.list.map(it => `<li><a href="${it.href}">${esc(it.spot.name)}<span class="fa-area">${esc(it.spot.area)}</span>${it.info.periodLabel ? `<span class="ev-period">🎃 ${esc(it.info.periodLabel)}</span>` : ''}${it.info.note ? `<span class="ev-note">${esc(it.info.note)}</span>` : ''}</a></li>`).join('')}</ul></div>`).join('')}
<a class="cta" href="${BASE}">🧭 おでかけナビで検索・絞り込みして探す</a>
</div>
` + FOOTER;
  return h;
}

function main() {
  const app = loadApp(INDEX_PATH);
  const out = [];
  EVENTS.forEach(ev => { const html = eventPage(ev, app); if (html) out.push({ rel: `event/${ev.slug}/index.html`, html, ev }); });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  out.forEach(o => { const p = path.join(OUT_DIR, o.rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, o.html); });
  console.log(`${out.length} ファイルを ${OUT_DIR}/ に生成しました: ${out.map(o => o.rel).join(', ')}`);
  if (SITEMAP && fs.existsSync(SITEMAP)) {
    let x = fs.readFileSync(SITEMAP, 'utf8');
    out.forEach(o => {
      const loc = `${SITE}${o.rel.replace(/index\.html$/, '')}`;
      if (x.includes(`<loc>${loc}</loc>`)) return;
      x = x.replace('</urlset>', `<url>\n<loc>${loc}</loc>\n<changefreq>weekly</changefreq>\n<priority>0.8</priority>\n</url>\n</urlset>`);
    });
    fs.writeFileSync(SITEMAP, x);
    console.log('sitemap.xml に追記しました: ' + SITEMAP);
  }
}
if (require.main === module) main();
module.exports = { main };
