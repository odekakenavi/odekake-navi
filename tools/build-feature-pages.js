#!/usr/bin/env node
/**
 * おでかけナビ 特集ページ生成ツール
 *   /purpose/<ジャンル>/（動物園・水族館・公園など）・/purpose/（目的から探す）・/free/・/rainy-day/・/baby/ を、
 *   data/spots.json から作る。見た目・構成は、これまでのアスレチック／無料／雨の日ページと同じ。
 *
 *   node tools/build-feature-pages.js --index index.html --spots data/spots.json --out _build_feature
 *
 * 方針:
 *   ・施設ページ（sitemap に載る＝URLが確定している施設）だけをリンクする。ファイルは書き換えない（--out に作るだけ）。
 *   ・「雨の日／無料／赤ちゃん向け」の判定は、build-static-pages.js の関連リンク判定と同じ基準（雨の日=雨レベル3以上、無料=入園・入館無料、
 *     赤ちゃん=対象年齢に0-1歳を含み高学年向けでない）。基準を変える時は両方を直すこと。
 *   ・GitHub Actions が公開の直前に自動で実行する（tools/refresh-static-pages.js 経由）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { main } = require('./build-static-pages.js');

const SITE = 'https://odekakenavi.github.io/odekake-navi/';
const argv = process.argv.slice(2);
const outI = argv.indexOf('--out');
const OUT = path.resolve(outI >= 0 && argv[outI + 1] ? argv[outI + 1] : '_build_feature');

// 都道府県の並び（スラッグ→表示名）
const PREFS = [['tokyo', '東京都'], ['kanagawa', '神奈川県'], ['saitama', '埼玉県'], ['chiba', '千葉県'], ['ibaraki', '茨城県'], ['tochigi', '栃木県'], ['gunma', '群馬県'], ['yamanashi', '山梨県'], ['shizuoka', '静岡県'], ['fukushima', '福島県'], ['nagano', '長野県']];

// 目的別ページの設定（genre は deriveCategory の結果＝GENRES の名前）。順番が「目的から探す」の並び。
const PURPOSES = [
  { slug: 'zoo', genre: '動物園', icon: '🐼', label: '動物園', noun: '動物園' },
  { slug: 'aquarium', genre: '水族館', icon: '🐠', label: '水族館', noun: '水族館' },
  { slug: 'indoor', genre: '室内遊び場', icon: '🧸', label: '室内遊び場', noun: '室内遊び場' },
  { slug: 'park', genre: '公園', icon: '🌳', label: '公園', noun: '公園' },
  { slug: 'museum', genre: '博物館・科学館', icon: '🔬', label: '博物館・科学館', noun: '博物館・科学館' },
  { slug: 'amusement', genre: '遊園地・テーマパーク', icon: '🎡', label: '遊園地・テーマパーク', noun: '遊園地・テーマパーク' },
  { slug: 'fruit-picking', genre: '果物狩り・収穫体験', icon: '🍓', label: '果物狩り・収穫体験', noun: '果物狩り・収穫体験' },
  { slug: 'onsen', genre: '温泉・スパ', icon: '♨️', label: '温泉・スパ', noun: '温泉・スパ' },
  { slug: 'ranch', genre: '牧場', icon: '🐮', label: '牧場', noun: '牧場' },
  { slug: 'athletic', genre: 'アスレチック・アウトドア', icon: '🌲', label: 'アスレチック・アウトドア', noun: 'アスレチック' },
  { slug: 'craft', genre: 'ものづくり体験', icon: '🎨', label: 'ものづくり体験', noun: 'ものづくり体験' },
  { slug: 'pool', genre: 'プール・水遊び', icon: '🏊', label: 'プール・水遊び', noun: 'プール・水遊び' },
  { slug: 'flower', genre: '花の名所', icon: '🌼', label: '花の名所', noun: '花の名所' },
  { slug: 'other', genre: 'おでかけスポット', icon: '📍', label: 'その他のおでかけスポット', noun: 'おでかけスポット' },
];
// 関連ページに並べる主要ジャンル（これまでのページと同じ9つ）
const RELATED_SLUGS = ['zoo', 'aquarium', 'indoor', 'park', 'museum', 'amusement', 'fruit-picking', 'onsen', 'ranch'];

// ------------------------------------------------------------------ 判定（build-static-pages.js と同じ基準）
const INDOOR_HINTS = ['水族館', '博物館', '科学館', 'ミュージアム', 'タワー', 'プラネタリウム', '屋内', 'ドーム', '美術館', '動物園（屋内', '防災館', 'アリーナ'];
const OUTDOOR_HINTS = ['公園', '牧場', 'サファリ', 'ハイキング', '登山', '海岸', 'ビーチ', 'キャンプ', '動物園', '植物園', '古墳', '城址', '展望', '湖', '滝', '高原'];
function deriveRainLevel(spot) {
  if (spot.rainLevel) return spot.rainLevel;
  const weather = spot.weather || [];
  const both = weather.includes('晴れ') && weather.includes('雨');
  const rainOnly = weather.includes('雨') && !weather.includes('晴れ');
  const text = (spot.name || '') + (spot.desc || '');
  if (both || rainOnly) return 4;
  const indoor = INDOOR_HINTS.some(h => text.includes(h));
  const outdoor = OUTDOOR_HINTS.some(h => text.includes(h));
  if (indoor && !outdoor) return 3;
  if (outdoor) return 1;
  return 2;
}
function parsePriceYen(price) {
  if (!price) return null;
  if ((price.includes('入園無料') || price.includes('入館無料')) || (price.includes('無料') && !/[0-9]/.test(price))) return 0;
  const m = price.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,5})\s*円/);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  return null;
}
const isFree = s => parsePriceYen(s.price) === 0;
const isRainy = s => deriveRainLevel(s) >= 3;
const isBaby = s => { const a = s.ages || []; return a.includes('0-1歳') && !a.includes('高学年'); };

// ------------------------------------------------------------------ HTML部品
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const CSS = `:root{--cream:#FBF7EF;--paper:#FFFDF8;--ink:#2B2620;--ink-soft:#6b6259;--sun:#3E8FB0;--coral:#E2603A;--green:#4F7942;--line:#E7DFCF;--yellow:#F4B740}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:"Noto Sans JP",sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:var(--sun);text-decoration:none}
a:hover{text-decoration:underline}
header.site-header{padding:14px 16px;border-bottom:1px solid var(--line);background:var(--paper)}
header.site-header a{font-weight:900;font-size:15px;color:var(--ink)}
.breadcrumb{font-size:12px;color:var(--ink-soft);padding:10px 16px 0;line-height:1.8}
.breadcrumb a{color:var(--sun)}
main{max-width:760px;margin:0 auto;padding:8px 16px 40px}
h1{font-family:"Zen Maru Gothic",sans-serif;font-size:22px;line-height:1.5;margin:14px 0 6px}
.lead{font-size:13.5px;color:var(--ink-soft);line-height:1.8;margin-bottom:18px}
.count-badge{display:inline-block;font-size:12px;font-weight:700;color:var(--coral);background:#FDEDE6;border-radius:999px;padding:3px 10px;margin-bottom:10px}
.disclaimer{font-size:11px;color:#8a6a3f;background:#FBF0DC;border-radius:8px;padding:8px 12px;margin:14px 0;line-height:1.7}
.quick-links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 22px}
.quick-links a{border:1.5px solid var(--line);background:var(--paper);border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:700;color:var(--ink)}
.quick-links a:hover{border-color:var(--coral);color:var(--coral);text-decoration:none}
.region-section{margin:26px 0}
.region-section-title{font-family:"Zen Maru Gothic",sans-serif;font-size:16px;font-weight:700;margin:0 0 4px;display:flex;align-items:baseline;gap:8px}
.region-section-title a{color:var(--ink)}
.region-section-title .cnt{font-size:11.5px;font-weight:500;color:var(--ink-soft)}
.spot-list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:7px}
.spot-list li{border:1px solid var(--line);background:var(--paper);border-radius:10px;padding:9px 12px}
.spot-list a{font-size:13.5px;font-weight:700;color:var(--ink)}
.spot-list .area{font-size:11px;color:var(--ink-soft);margin-top:2px}
.ward-grid{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
.ward-grid a{border:1.5px solid var(--line);background:var(--paper);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;color:var(--ink)}
.ward-grid a:hover{border-color:var(--sun);color:var(--sun);text-decoration:none}
.ward-grid .cnt{color:var(--ink-soft);font-weight:500;font-size:11.5px}
.cta-box{margin:30px 0;padding:18px;border-radius:14px;background:linear-gradient(135deg,#FFF6EF 0%,#FCE3B8 100%);border:1px solid #F0D9AE;text-align:center}
.cta-box .t{font-weight:900;font-size:15px;margin-bottom:6px}
.cta-box .d{font-size:12.5px;color:var(--ink-soft);margin-bottom:12px}
.cta-box a.btn{display:inline-block;background:var(--coral);color:#fff;font-weight:800;padding:11px 24px;border-radius:999px;font-size:14px}
.cta-box a.btn:hover{text-decoration:none;opacity:.92}
.related{margin:24px 0}
.related-title{font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:8px}
footer.site-footer{text-align:center;padding:20px 16px 30px;font-size:10.5px;color:var(--ink-soft);border-top:1px solid var(--line);line-height:1.8}
footer.site-footer a{color:var(--ink-soft)}`;

function breadcrumbLd(items) {
  return ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => Object.assign({ '@type': 'ListItem', position: i + 1, name: it[0] }, it[1] ? { item: it[1] } : {})) });
}
function head({ title, description, url }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="おでかけナビ">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${SITE}og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}og-image.png">
<meta name="theme-color" content="#3E8FB0">
<link rel="manifest" href="${SITE}manifest.webmanifest">
<style>
${CSS}
</style>
</head>
`;
}
const quickLinks = `<nav class="quick-links">
<a href="${SITE}purpose/">🎯 目的から探す</a>
<a href="${SITE}season/summer/">🌸 季節から探す</a>
<a href="${SITE}rainy-day/">☔ 雨の日特集</a>
<a href="${SITE}free/">💰 無料スポット</a>
<a href="${SITE}baby/">👶 赤ちゃん向け</a>
</nav>`;
const footer = `<footer class="site-footer">
料金・駐車場・混雑・所要時間・営業日はすべて目安です。訪問前に必ず公式サイトをご確認ください。<br>
データ出典・運営者情報・免責事項は<a href="${SITE}">おでかけナビ トップページ</a>の「よくある質問」「運営者について」でご確認いただけます。<br>
© おでかけナビ
</footer>`;
const cta = `<div class="cta-box">
<div class="t">🎯 まだ決まらない？「今日どこ行く？」</div>
<div class="d">気分を3問答えるだけで、おでかけナビが今日のイチオシをおすすめします</div>
<a class="btn" href="${SITE}">3問でおまかせ診断へ</a>
</div>`;

function regionSections(rows) {
  const byPref = new Map();
  rows.forEach(r => { if (!byPref.has(r.prefSlug)) byPref.set(r.prefSlug, []); byPref.get(r.prefSlug).push(r); });
  return PREFS.filter(([slug]) => byPref.has(slug)).map(([slug, name]) => {
    const list = byPref.get(slug).slice().sort((a, b) => (a.spot.name < b.spot.name ? -1 : a.spot.name > b.spot.name ? 1 : 0));
    return `<section class="region-section">
<h2 class="region-section-title">
<a href="${SITE}${slug}/">${name}</a>
<span class="cnt">${list.length}件</span>
</h2>
<ul class="spot-list">
${list.map(r => `<li>
<a href="${SITE}${r.slug}/">${esc(r.spot.name)}</a>
<div class="area">${esc(r.spot.area)}</div>
</li>`).join('\n')}
</ul>
</section>`;
  }).join('\n');
}
function relatedBlock(excludeSlug) {
  const links = [`<a href="${SITE}purpose/">目的から探す トップ</a>`].concat(PURPOSES.filter(p => RELATED_SLUGS.includes(p.slug) && p.slug !== excludeSlug)
    .map(p => `<a href="${SITE}purpose/${p.slug}/">${p.icon} ${p.label}特集</a>`));
  return `<div class="related">
<div class="related-title">🎯 関連ページ</div>
<div class="quick-links">
${links.join('\n')}
</div>
</div>`;
}

// 特集ページ1枚（施設の一覧型）
function listPage({ path: pagePath, title, description, h1, lead, crumbs, rows, excludeRelated }) {
  const url = SITE + pagePath;
  const itemLd = ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: h1.replace(/^\S+\s/, ''), numberOfItems: rows.length,
    itemListElement: rows.slice().sort((a, b) => (a.spot.name < b.spot.name ? -1 : 1)).map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.spot.name, url: SITE + r.slug + '/' })) });
  const crumbHtml = crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>` : esc(c[0]))).join(' ／ ');
  return head({ title, description, url }) + `<body>
<header class="site-header">
<a href="${SITE}">🧭 おでかけナビ</a>
</header>
<nav class="breadcrumb">
${crumbHtml}</nav>
${breadcrumbLd(crumbs.map((c, i) => [c[0], i < crumbs.length - 1 ? c[1] : undefined]))}
<main>
<span class="count-badge">登録スポット数：${rows.length}件</span>
<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${quickLinks}
${regionSections(rows)}
${cta}
${relatedBlock(excludeRelated)}
${itemLd}
${footer}
</main>
<script src="/odekake-navi/site-ui.js" defer></script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ 本体
const { rows } = main();
const files = new Map();
const TOP = ['おでかけナビ', SITE];
const PURPOSE_TOP = ['目的から探す', SITE + 'purpose/'];
const warnings = [];

const counts = [];
PURPOSES.forEach(p => {
  const list = rows.filter(r => r.genre === p.genre);
  if (!list.length) { warnings.push(`目的別ページ「${p.genre}」は、該当する施設が0件のため作りませんでした`); return; }
  counts.push([p, list.length]);
  files.set(`purpose/${p.slug}/index.html`, listPage({
    path: `purpose/${p.slug}/`,
    title: `${p.label}特集｜子連れで行きたい${p.noun}まとめ｜おでかけナビ`,
    description: `関東・近県の子連れで楽しめる${p.label}スポットを地域ごとにまとめました。現在${list.length}件のスポットを掲載。`,
    h1: `${p.icon} ${p.label}特集`,
    lead: `関東・近県の子連れで楽しめる${p.label}スポットを地域ごとにまとめました。現在${list.length}件を掲載。お住まいの地域から探せます。`,
    crumbs: [TOP, PURPOSE_TOP, [`${p.label}特集`, null]],
    rows: list, excludeRelated: p.slug,
  }));
});

// 目的から探す（トップ）
{
  const url = SITE + 'purpose/';
  const title = '目的から探す｜子連れお出かけスポット特集｜おでかけナビ';
  const description = `動物園・水族館・公園・室内遊び場など、行きたい場所の種類から子連れお出かけスポットを探せます。現在${rows.length}件を掲載。`;
  files.set('purpose/index.html', head({ title, description, url }) + `<body>
<header class="site-header">
<a href="${SITE}">🧭 おでかけナビ</a>
</header>
<nav class="breadcrumb">
<a href="${SITE}">おでかけナビ</a> ／ 目的から探す</nav>
${breadcrumbLd([['おでかけナビ', SITE], ['目的から探す', null]])}
<main>
<span class="count-badge">登録スポット数：${rows.length}件</span>
<h1>🎯 目的から探す</h1>
<p class="lead">行きたい場所の種類から、子連れで楽しめるお出かけスポットを探せます。気になる特集を選んでください。</p>
<div class="ward-grid">
${counts.map(([p, n]) => `<a href="${SITE}purpose/${p.slug}/">${p.icon} ${esc(p.label)} <span class="cnt">${n}件</span></a>`).join('\n')}
</div>
<div class="related">
<div class="related-title">条件から探す</div>
<div class="quick-links">
<a href="${SITE}rainy-day/">☔ 雨の日特集</a>
<a href="${SITE}free/">💰 無料スポット</a>
<a href="${SITE}baby/">👶 赤ちゃん向け</a>
<a href="${SITE}season/summer/">🌸 季節から探す</a>
</div>
</div>
${cta}
${footer}
</main>
<script src="/odekake-navi/site-ui.js" defer></script>
</body>
</html>
`);
}

// 条件別の特集
const rain = rows.filter(r => isRainy(r.spot)), free = rows.filter(r => isFree(r.spot)), baby = rows.filter(r => isBaby(r.spot));
files.set('rainy-day/index.html', listPage({
  path: 'rainy-day/', title: '雨の日でも遊べる子連れお出かけスポット特集｜おでかけナビ',
  description: `雨の日でも安心して遊べる、屋内中心の子連れお出かけスポットを地域ごとにまとめました。現在${rain.length}件を掲載。`,
  h1: '☔ 雨の日でも遊べるお出かけ特集',
  lead: `雨の日でも安心して楽しめる、屋内中心の施設や雨天対応の設備が整ったスポットをまとめました。現在${rain.length}件を掲載。「おでかけナビ」に登録されている天候情報・施設情報をもとに選んでいます。`,
  crumbs: [TOP, ['雨の日特集', null]], rows: rain }));
files.set('free/index.html', listPage({
  path: 'free/', title: '無料で遊べる子連れお出かけスポット特集｜おでかけナビ',
  description: `入園・入館無料で楽しめる子連れお出かけスポットを地域ごとにまとめました。現在${free.length}件を掲載。`,
  h1: '💰 無料で遊べるお出かけ特集',
  lead: `入園・入館が無料の子連れお出かけスポットをまとめました。現在${free.length}件を掲載。公園や広場など、お財布を気にせず楽しめる場所を地域ごとに探せます。※施設内の一部有料設備（乗り物・体験コーナーなど）は対象外の場合があります。`,
  crumbs: [TOP, ['無料スポット特集', null]], rows: free }));
files.set('baby/index.html', listPage({
  path: 'baby/', title: '赤ちゃん連れで行きやすい子連れお出かけスポット特集｜おでかけナビ',
  description: `0〜1歳の赤ちゃん連れでも出かけやすい子連れお出かけスポットを地域ごとにまとめました。現在${baby.length}件を掲載。`,
  h1: '👶 赤ちゃん向けお出かけ特集',
  lead: `対象年齢に0〜1歳が含まれ、小さな赤ちゃん連れでも出かけやすいスポットをまとめました。現在${baby.length}件を掲載。授乳室・おむつ替え・ベビーカーの情報は、各施設のページでご確認ください。`,
  crumbs: [TOP, ['赤ちゃん向け特集', null]], rows: baby }));

fs.rmSync(OUT, { recursive: true, force: true });
for (const [rel, body] of files) { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
warnings.forEach(w => console.error('注意: ' + w));
console.log(`${files.size} ファイルを ${path.relative(process.cwd(), OUT) || OUT}/ に生成しました（目的別 ${counts.length}／雨の日 ${rain.length}件／無料 ${free.length}件／赤ちゃん ${baby.length}件）`);
