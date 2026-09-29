#!/usr/bin/env node
// おでかけナビ イベント特集ページ生成ツール（/event/halloween/ と /event/christmas/ だけを作る）
//   node tools/build-event-pages.js --out _build     … _build/event/{halloween,christmas}/index.html を生成
//   node tools/build-event-pages.js --only christmas … 片方だけ生成
//   （--index index.html / --spots data/spots.json で入力の場所を変えられる）
// 方針：
//   ・施設データ(data/spots.json)の events / eventInfo[イベント名] だけから作る。施設は追加しない。
//   ・施設ページのURLは index.html の SLUG_OVERRIDES（URL確定済みの表）をそのまま使う。表に無い施設はエラーで止める。
//   ・sitemap.xml や他のページには一切触らない。
//   ・別のイベント（例：お花見）を足す時は、下の EVENTS に1つ書き足す。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://odekakenavi.github.io/odekake-navi/';
const BASE = '/odekake-navi/';
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const OUT_DIR = arg('out', '_build');
const INDEX_PATH = arg('index', 'index.html');
const SPOTS_PATH = arg('spots', 'data/spots.json');
const ONLY = arg('only', null);

const PREF_ORDER = ['東京', '神奈川', '埼玉', '千葉', '茨城', '栃木', '群馬', '山梨', '静岡', '長野', '福島'];
const NEARBY = ['山梨', '静岡', '長野', '福島'];
const AGE_ORDER = ['0-1歳', '2-3歳', '4-6歳', '低学年', '高学年'];

// ------------------------------------------------------------------ イベントごとの設定
const EVENTS = {
  halloween: {
    key: 'ハロウィン', slug: 'halloween', emoji: '🎃', navLabel: '🎃 ハロウィン',
    h1: '🎃 子どもと楽しむハロウィン特集',
    subtitle: '仮装してどこ行く？親子で楽しめるハロウィンスポット',
    breadcrumb: 'ハロウィン特集', ldName: '2026年 子どもと楽しむハロウィン特集',
    title: p => `子どもと楽しむハロウィン特集【2026】${p}の子連れスポット｜おでかけナビ`,
    ogTitle: '🎃 子どもと楽しむハロウィン特集｜仮装してどこ行く？',
    desc: (p, n) => `仮装してどこ行く？2026年のハロウィンを親子で楽しめる${p}のおでかけ先を${n}件掲載。開催期間・仮装ルール・対象年齢・駐車場の有無つき。`,
    intro: (p, list) => `「おでかけナビ」に登録されているスポットの中から、2026年のハロウィンを子どもと楽しめる${p}のおでかけ先（${list}）をまとめました。仮装やショー、フォトスポットに加えて、対象年齢と駐車場の有無も載せているので、子連れでも行きやすいかどうか選ぶ目安にしてください。`,
    notice: '開催期間・仮装のルール・料金は変更になることがあります。お出かけ前に必ず公式サイトで最新情報をご確認ください。',
    seasonLink: ['🍁 秋のお出かけ', 'season/autumn/'],
    altType: 'photo', altChip: '📸 フォトスポット',
    groups: [
      { id: 'group-1', title: '🎃 ハロウィンイベント', sub: '仮装・ショー・お菓子など、期間中に開催されるイベントです', alt: false },
      { id: 'group-2', title: '📸 装飾・フォトスポット', sub: 'ハロウィン装飾やライトアップ、映像ショーを楽しめる場所です', alt: true },
    ],
    order: ['サンリオピューロランド', 'アンパンマンこどもミュージアム＆モール横浜', '東京ディズニーシー', '東京ディズニーランド', 'よみうりランド', '花やしき', 'むさしの村', 'アクアワールド茨城県大洗水族館', 'ハリー・ポッター スタジオツアー東京', '富士急ハイランド', 'リトルプラネット ダイバーシティ東京 プラザ', 'リトルプラネット イオンモール川口', '東京タワー', '横浜イングリッシュガーデン', '夢の島公園・熱帯植物館'],
    ctaText: '🧭 おでかけナビでハロウィン施設を絞り込んで探す', ctaParam: 'halloween',
  },
  christmas: {
    key: 'クリスマス', slug: 'christmas', emoji: '🎄', navLabel: '🎄 クリスマス',
    h1: '🎄 子どもと楽しむクリスマス特集',
    subtitle: 'サンタやイルミネーションに会いに行こう！親子で楽しめるクリスマススポット',
    breadcrumb: 'クリスマス特集', ldName: '2026年 子どもと楽しむクリスマス特集',
    title: p => `子どもと楽しむクリスマス特集【2026】${p}の子連れスポット・イルミネーション｜おでかけナビ`,
    ogTitle: '🎄 子どもと楽しむクリスマス特集｜サンタとイルミネーション',
    desc: (p, n) => `サンタやイルミネーションに会いに行こう！2026年のクリスマスシーズンを親子で楽しめる${p}のおでかけ先を${n}件掲載。開催期間・対象年齢・駐車場の有無つき。`,
    intro: (p, list) => `「おでかけナビ」に登録されているスポットの中から、2026年のクリスマスシーズンを子どもと楽しめる${p}のおでかけ先（${list}）をまとめました。パレードやサンタとの出会い、イルミネーションに加えて、対象年齢と駐車場の有無も載せているので、子連れでも行きやすいかどうか選ぶ目安にしてください。クリスマスの企画は秋から冬にかけて順次発表されるため、開催が確認できた施設から順に掲載しています。`,
    notice: '開催期間・点灯時間・料金は変更になることがあります。お出かけ前に必ず公式サイトで最新情報をご確認ください。',
    seasonLink: ['❄️ 冬のお出かけ', 'season/winter/'],
    altType: 'illumination', altChip: '✨ イルミネーション',
    groups: [
      { id: 'group-1', title: '🎄 クリスマスイベント', sub: 'パレードやサンタとの出会い、クリスマス限定の企画です', alt: false },
      { id: 'group-2', title: '✨ イルミネーション', sub: '光の演出やライトアップを楽しめる場所です', alt: true },
    ],
    order: ['東京ディズニーランド', '東京ディズニーシー', 'ムーミンバレーパーク', '東京ドイツ村', 'よみうりランド', 'さがみ湖MORI MORI', 'あしかがフラワーパーク', '東京ドームシティアトラクションズ', '東武動物公園', 'マザー牧場', 'ソレイユの丘'],
    ctaText: '🧭 おでかけナビでクリスマス施設を絞り込んで探す', ctaParam: 'christmas',
  },
};

// ------------------------------------------------------------------ 共通ヘルパー
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ymd = iso => iso.split('-').map(Number);
const md = iso => { const [, m, d] = ymd(iso); return `${m}/${d}`; };
function periodText(starts, ends) {
  const s = starts[0], e = ends[ends.length - 1];
  return ymd(s)[0] === ymd(e)[0] ? `${md(s)}〜${md(e)}` : `${md(s)}〜${ymd(e)[0]}/${md(e)}`;
}
function ageLabel(spot) {
  const a = AGE_ORDER.filter(x => (spot.ages || []).includes(x));
  if (!a.length) return '';
  if (a.length === AGE_ORDER.length) return '幅広い年齢';
  return a.length <= 2 ? a.join('・') : a[0] + '〜' + a[a.length - 1];
}
// 「子ども連れ不可」を含む一文を注意書きとして取り出す（データ自体は変更しない）
function splitWarning(note) {
  const m = note.match(/[^。]*子ども連れ不可[^。]*。?/);
  if (!m) return { note, warn: '' };
  return { note: note.replace(m[0], '').trim(), warn: m[0].trim() };
}
// index.html から SLUG_OVERRIDES（施設名→URL）を取り出す（整形版・圧縮版どちらでも読める）
function loadSlugOverrides(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const m = /const SLUG_OVERRIDES\s*=\s*\{/.exec(html);
  if (!m) throw new Error('index.html に SLUG_OVERRIDES が見つかりません');
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = null, i = start;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return vm.runInNewContext('(' + html.slice(start, i + 1) + ')');
}

const CSS = `
  body{font-family:"Noto Sans JP",sans-serif; background:#FBF7EF; color:#2B2620; margin:0; padding:0; line-height:1.7;}
  [hidden]{display:none !important;}
  .wrap{max-width:640px; margin:0 auto; padding:20px 18px 60px;}
  header.site{padding:14px 18px; background:#3E8FB0;}
  header.site a{color:#fff; text-decoration:none; font-weight:700;}
  nav.breadcrumb{font-size:13px; color:#6b6258; margin:16px 0 10px;}
  nav.breadcrumb a{color:#3E8FB0; text-decoration:none;}
  h1{font-size:22px; margin:6px 0 2px;}
  .subtitle{font-size:14px; font-weight:700; color:#A34700; margin:0 0 12px;}
  .period-badge{display:inline-block; background:#F4B740; color:#2B2620; border-radius:20px; padding:3px 14px; font-size:13px; margin-bottom:6px; font-weight:700;}
  .count-badge{display:inline-block; background:#E2603A; color:#fff; border-radius:20px; padding:3px 12px; font-size:13px; margin-bottom:14px; margin-left:6px;}
  .intro{margin:10px 0 16px; font-size:14px; color:#4a443c;}
  .season-nav{display:flex; gap:8px; margin:10px 0 18px; flex-wrap:wrap;}
  .season-nav a{flex:1; min-width:70px; text-align:center; background:#fff; border:1px solid #eadfca; border-radius:10px; padding:8px 4px; text-decoration:none; color:#2B2620; font-size:13px; font-weight:700;}
  .season-nav a.current{border-color:#E2603A; background:#FFF1E6;}
  .filter-label{font-size:12px; color:#928a7c; margin:0 0 6px;}
  .filter-chips{display:flex; gap:8px; flex-wrap:wrap; margin:0 0 18px;}
  .filter-chips button{font-family:inherit; font-size:13px; font-weight:700; padding:8px 12px; min-height:40px; border-radius:20px; border:1px solid #eadfca; background:#fff; color:#2B2620; cursor:pointer;}
  .filter-chips button[aria-pressed="true"]{border-color:#E2603A; background:#FFF1E6; color:#A34700;}
  .filter-empty{font-size:13px; color:#6b6258; margin:0 0 18px;}
  .region-block{margin:26px 0;}
  .region-title{font-size:16px; font-weight:400; border-left:4px solid #F4B740; padding-left:8px; margin:0 0 2px;}
  .region-title a{color:#2B2620; text-decoration:none;}
  .region-sub{font-size:12px; color:#928a7c; margin:0 0 10px 12px;}
  .facility-list{list-style:none; margin:0; padding:0;}
  .facility-list li{margin-bottom:10px;}
  .facility-list a{display:block; background:#fff; border:1px solid #eadfca; border-radius:10px; padding:12px 14px; text-decoration:none; color:#2B2620; font-size:14px; font-weight:600;}
  .facility-list a .fa-area{display:block; font-weight:400; font-size:12px; color:#928a7c; margin-top:2px;}
  .facility-list a .ev-period{display:inline-block; background:#FFE7CC; color:#A34700; border-radius:20px; padding:1px 10px; font-size:12px; font-weight:700; margin-top:6px;}
  .facility-list a .ev-period.ev-tentative{background:#F1EEE8; color:#6b6258;}
  .facility-list a .badges{display:block; margin-top:6px;}
  .facility-list a .badge{display:inline-block; background:#EAF3E0; color:#3d6b2a; border-radius:20px; padding:1px 10px; font-size:12px; font-weight:700; margin:0 6px 4px 0;}
  .facility-list a .badge-off{background:#F1EEE8; color:#6b6258;}
  .facility-list a .ev-note{display:block; font-weight:400; font-size:12.5px; color:#4a443c; margin-top:4px; line-height:1.6;}
  .facility-list a .ev-warn{display:block; font-weight:700; font-size:12.5px; color:#8A2E12; background:#FDECE6; border:1px solid #F0B9A6; border-radius:8px; padding:6px 10px; margin-top:8px; line-height:1.6;}
  .notice{background:#FFF6EA; border:1px solid #F3C89B; border-radius:10px; padding:10px 12px; font-size:12.5px; color:#4a443c; margin:0 0 18px;}
  .cta{display:block; text-align:center; background:#3E8FB0; color:#fff !important; text-decoration:none; font-weight:700; padding:14px; border-radius:12px; margin:26px 0 10px;}
  footer{font-size:12px; color:#928a7c; text-align:center; padding:24px 18px 40px;}
  footer a{color:#3E8FB0;}
`;
const JS = `(function(){
  var chips=document.querySelectorAll('.filter-chips button');
  var items=document.querySelectorAll('.facility-list li');
  var blocks=document.querySelectorAll('.region-block');
  var empty=document.getElementById('filterEmpty');
  var bar=document.getElementById('filterBar');
  if(!chips.length||!bar)return;
  bar.hidden=false;
  function apply(key){
    var shown=0;
    items.forEach(function(li){var ok=key==='all'||li.getAttribute('data-'+key)==='1';li.hidden=!ok;if(ok)shown++;});
    blocks.forEach(function(b){b.hidden=!b.querySelector('li:not([hidden])');});
    empty.hidden=shown>0;
    chips.forEach(function(c){c.setAttribute('aria-pressed',c.getAttribute('data-filter')===key?'true':'false');});
  }
  chips.forEach(function(c){c.addEventListener('click',function(){apply(c.getAttribute('data-filter'));});});
})();`;

// ------------------------------------------------------------------ 1イベント分のページを作る
function buildPage(cfg, spots, SLUGS) {
  let items = spots
    .filter(s => (s.events || []).includes(cfg.key) && s.eventInfo && s.eventInfo[cfg.key])
    .map(s => {
      if (!SLUGS[s.name]) throw new Error('URLが確定していない施設です（SLUG_OVERRIDES に無い）: ' + s.name);
      return { spot: s, slug: SLUGS[s.name] };
    });
  // 日程が確定している施設を先に、「日程は発表待ち」（tentative）の施設は後ろに並べる
  const tent = r => r.spot.eventInfo[cfg.key].tentative ? 1 : 0;
  items.sort((a, b) => {
    if (tent(a) !== tent(b)) return tent(a) - tent(b);
    const ia = cfg.order.indexOf(a.spot.name), ib = cfg.order.indexOf(b.spot.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  if (!items.length) throw new Error(`${cfg.key} の施設が見つかりません`);
  const infoOf = r => r.spot.eventInfo[cfg.key];
  const isAlt = r => infoOf(r).type === cfg.altType;
  const groups = cfg.groups.map(g => Object.assign({ list: items.filter(r => isAlt(r) === g.alt) }, g)).filter(g => g.list.length);

  const dated = items.filter(r => !infoOf(r).tentative);
  const hasTentative = dated.length < items.length;
  const starts = dated.map(r => infoOf(r).start).filter(Boolean).sort();
  const ends = dated.map(r => infoOf(r).end).filter(Boolean).sort();
  const period = periodText(starts, ends);
  const n = items.length;
  const prefs = PREF_ORDER.filter(p => items.some(r => r.spot.region === p));
  const prefList = prefs.join('・');
  const prefText = prefs.length > 3 ? (prefs.some(p => NEARBY.includes(p)) ? '関東・近県' : '関東') : prefList;
  const URL = `${SITE}event/${cfg.slug}/`;
  const title = cfg.title(prefText), desc = cfg.desc(prefText, n);

  const card = r => {
    const s = r.spot, i = infoOf(r);
    const { note, warn } = splitWarning(i.note || '');
    const badges = [];
    const al = ageLabel(s);
    if (al) badges.push(`<span class="badge">👶 ${esc(al)}</span>`);
    badges.push(s.parking === 'yes' ? '<span class="badge">🚗 駐車場あり</span>' : '<span class="badge badge-off">🚗 駐車場なし</span>');
    const baby = (s.ages || []).includes('0-1歳') ? '1' : '0';
    const parking = s.parking === 'yes' ? '1' : '0';
    return `<li data-alt="${isAlt(r) ? '1' : '0'}" data-parking="${parking}" data-baby="${baby}"><a href="${BASE}${r.slug}/">${esc(s.name)}<span class="fa-area">${esc(s.area)}</span><span class="ev-period${i.tentative ? ' ev-tentative' : ''}">${cfg.emoji} ${i.tentative ? '例年開催・今年の日程は発表待ち' : esc(i.periodLabel || '')}</span><span class="badges">${badges.join('')}</span><span class="ev-note">${esc(note)}</span>${warn ? `<span class="ev-warn">⚠️ ${esc(warn)}</span>` : ''}</a></li>`;
  };
  const groupHtml = groups.map(g => `<div class="region-block" id="${g.id}"><h2 class="region-title">${g.title}（${g.list.length}件）</h2><div class="region-sub">${g.sub}</div><ul class="facility-list">${g.list.map(card).join('')}</ul></div>`).join('');

  const ld1 = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'おでかけナビ', item: SITE }, { '@type': 'ListItem', position: 2, name: cfg.breadcrumb }] };
  const ld2 = { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.ldName, numberOfItems: n, itemListElement: items.map((r, k) => ({ '@type': 'ListItem', position: k + 1, name: r.spot.name, url: SITE + r.slug + '/' })) };
  const pyJson = v => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "');

  const nav = Object.values(EVENTS).map(e => `<a class="season-nav-item${e === cfg ? ' current' : ''}" href="${BASE}event/${e.slug}/">${e.navLabel}</a>`).join('') + `<a class="season-nav-item" href="${BASE}${cfg.seasonLink[1]}">${cfg.seasonLink[0]}</a>`;
  const chips = [['all', 'すべて'], ['alt', cfg.altChip], ['parking', '🚗 駐車場あり'], ['baby', '👶 0〜1歳から']]
    .map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${k === 'all' ? 'true' : 'false'}">${l}</button>`).join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${URL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="おでかけナビ">
<meta property="og:title" content="${esc(cfg.ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${URL}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(cfg.ogTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${pyJson(ld1)}</script>
<script type="application/ld+json">${pyJson(ld2)}</script>

<style>${CSS}</style>
</head>
<body>
<header class="site"><a href="${BASE}">🧭 おでかけナビ</a></header>
<div class="wrap">
<nav class="breadcrumb"><a href="${SITE}">おでかけナビ</a> ／ ${esc(cfg.breadcrumb)}</nav>
<div class="period-badge">${period}</div>
<div class="count-badge">${n}件掲載</div>
<h1>${cfg.h1}</h1>
<p class="subtitle">${cfg.subtitle}</p>
<p class="intro">${esc(cfg.intro(prefText, prefList))}</p>
<div class="season-nav">${nav}</div>
<div id="filterBar" hidden>
<div class="filter-label">条件でしぼる</div>
<div class="filter-chips">${chips}</div>
<p class="filter-empty" id="filterEmpty" hidden>この条件に合う施設は今のところありません。</p>
</div>
<div class="notice">${esc(cfg.notice)}${hasTentative ? '「日程は発表待ち」の施設は、発表され次第、更新します。' : ''}</div>
${groupHtml}
<a class="cta" href="${BASE}?event=${cfg.ctaParam}">${cfg.ctaText}</a>
</div>
<footer>
  データ出典・運営者情報・免責事項は<a href="${BASE}">おでかけナビ トップページ</a>の「よくある質問」「運営者について」でご確認いただけます。<br>
  © おでかけナビ
</footer>
<script>${JS}</script>
</body>
</html>`;
  return { html, n, period, groups: groups.map(g => `${g.title}${g.list.length}`) };
}

const SLUGS = loadSlugOverrides(INDEX_PATH);
const spots = JSON.parse(fs.readFileSync(SPOTS_PATH, 'utf8'));
Object.values(EVENTS).filter(e => !ONLY || e.slug === ONLY).forEach(cfg => {
  const r = buildPage(cfg, spots, SLUGS);
  const out = path.join(OUT_DIR, 'event', cfg.slug, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.html);
  console.log(`${cfg.key}特集ページを生成しました: ${out}（${r.n}件・${r.period}）`);
});
