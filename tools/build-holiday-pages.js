#!/usr/bin/env node
// おでかけナビ 年末年始・冬休み特集ページ生成ツール（/event/fuyuyasumi/ だけを作る）
//   node tools/build-holiday-pages.js --out _build   … _build/event/fuyuyasumi/index.html を生成
//   （--index index.html / --spots data/spots.json で入力の場所を変えられる）
// 方針：
//   ・施設データ(data/spots.json)の holidays に「年末年始」が付いた施設だけから作る。施設は追加しない。
//   ・イベント特集（build-event-pages.js）と同じ見た目・構造。共通部分（CSS/JS/ヘルパー）はそのまま複製している。
//   ・年末年始の営業日がまだ確認できていない施設は、下の UNCONFIRMED に名前を書いて一覧から外す
//     （アプリ内の「🎍 年末年始」絞り込みには残る）。確認できたら UNCONFIRMED から消すだけで載る。
//   ・休業日は spots.json の closedDays（日付を含む行）から自動で拾う。無ければ「年末年始も営業」と表示する。
//   ・sitemap.xml や他のページには一切触らない。
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

const PREF_ORDER = ['東京', '神奈川', '埼玉', '千葉', '茨城', '栃木', '群馬', '山梨', '静岡', '長野', '福島'];
const NEARBY = ['山梨', '静岡', '長野', '福島'];
const AGE_ORDER = ['0-1歳', '2-3歳', '4-6歳', '低学年', '高学年'];

// ------------------------------------------------------------------ 年末年始の設定
const CFG = {
  key: '年末年始', slug: 'fuyuyasumi', emoji: '🎍', navLabel: '🎍 年末年始・冬休み',
  period: '12/29〜1/3',
  h1: '🎍 子どもと楽しむ年末年始・冬休み特集',
  subtitle: 'お休み中はどこ行く？年末年始も営業しているおでかけスポット',
  breadcrumb: '年末年始・冬休み特集', ldName: '2026-2027年 子どもと楽しむ年末年始・冬休み特集',
  title: p => `子どもと楽しむ年末年始・冬休み特集【2026-2027】${p}の営業している子連れスポット｜おでかけナビ`,
  ogTitle: '🎍 子どもと楽しむ年末年始・冬休み特集｜お休み中のおでかけ',
  desc: (p, n) => `年末年始（12/29〜1/3）もお出かけできる！${p}の営業している子連れスポットを${n}件掲載。休業日・対象年齢・駐車場の有無つき。`,
  intro: (p, list) => `「おでかけナビ」に登録されているスポットの中から、年末年始（12/29〜1/3）に子どもと出かけられる${p}のおでかけ先（${list}）をまとめました。遊園地・動物園・水族館、雪遊び、公園や屋内施設に分けています。1/1などに休業する施設は、休業日を載せています。営業時間は通常と違う施設が多いので、お出かけ前に公式サイトで確認してください。`,
  notice: '年末年始は営業日・営業時間・料金が通常と変わることがあります。お出かけ前に必ず公式サイトで最新情報をご確認ください。',
  seasonLink: ['❄️ 冬のお出かけ', 'season/winter/'],
  navExtra: [['🎄 クリスマス', 'event/christmas/'], ['✨ イルミネーション', 'event/illumination/']],
  groups: [
    { id: 'group-1', title: '🎡 遊園地・動物園・水族館', sub: '年末年始も家族で遊べるテーマパーク・動物園・水族館・牧場です', genres: ['遊園地・テーマパーク', '動物園', '水族館', '牧場'] },
    { id: 'group-2', title: '⛄ 雪遊び・スケート', sub: '冬休みに雪遊びやそり遊びを楽しめるスキー場・雪遊びスポットです', genres: ['雪遊び・スケート'] },
    { id: 'group-3', title: '🌷 公園・屋内・観光スポット', sub: '花の名所、公園、屋内の遊び場、展望台などです', genres: null },
  ],
  groupChips: [{ g: 0, label: '🎡 遊園地・動物園・水族館' }, { g: 1, label: '⛄ 雪遊び' }, { g: 2, label: '🌷 公園・屋内・観光' }],
  ctaText: '🧭 おでかけナビで年末年始に行ける施設を絞り込んで探す', ctaParam: 'nenmatsu',
};
// 年末年始の営業日がまだ確認できていない施設（一覧から外す。確認できたらここから消す）
const UNCONFIRMED = ['マザー牧場', '東京ドイツ村', 'ソレイユの丘', '栃木県なかがわ水遊園', '猿島', 'よみうりランド', 'よこはまコスモワールド', 'GunmaFlowerPark＋（ぐんまフラワーパーク）'];

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
// 施設データの説明文（desc）から短い紹介文を作る（新しい情報は足さない。先頭の施設名は除く）
function descNote(spot) {
  let t = String(spot.desc || '').trim();
  if (t.startsWith(spot.name)) t = t.slice(spot.name.length).trim();
  const sentences = t.split('。').filter(Boolean);
  let out = '';
  for (const s of sentences) { if ((out + s).length > 110 && out) break; out += s + '。'; }
  return out.length > 130 ? out.slice(0, 128) + '…' : out;
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
    items.forEach(function(li){var ok=key==='all'||(/^g\\d+$/.test(key)?li.getAttribute('data-g')===key.slice(1):li.getAttribute('data-'+key)==='1');li.hidden=!ok;if(ok)shown++;});
    blocks.forEach(function(b){b.hidden=!b.querySelector('li:not([hidden])');});
    empty.hidden=shown>0;
    chips.forEach(function(c){c.setAttribute('aria-pressed',c.getAttribute('data-filter')===key?'true':'false');});
  }
  chips.forEach(function(c){c.addEventListener('click',function(){apply(c.getAttribute('data-filter'));});});
})();`;

// ------------------------------------------------------------------ 休業日の文言（closedDays から日付を含む行を拾う）
const YE = /12\/(2[6-9]|3[01])|1\/[1-5](?!\d)|年末年始/;
function closureText(spot) {
  const rows = (spot.closedDays || []).filter(r => YE.test(r));
  if (!rows.length) return '';
  const dates = rows.filter(r => /^[\d\/・〜]+$/.test(r));
  const others = rows.filter(r => !dates.includes(r))
    .map(r => r.replace(/^※/, '').replace(/（[^）]*(公式|条例)[^）]*）/g, '').trim()).filter(Boolean);
  const out = [];
  if (dates.length) out.push(dates.join('・') + '休業');
  return out.concat(others).join('。');
}

// ------------------------------------------------------------------ ページを作る
function buildPage(cfg, spots, SLUGS) {
  const items = spots
    .filter(s => (s.holidays || []).includes(cfg.key) && !UNCONFIRMED.includes(s.name))
    .map(s => {
      const slug = s.slug || SLUGS[s.name];
      if (!slug) throw new Error('URLが確定していない施設です（slug が無い）: ' + s.name);
      return { spot: s, slug };
    });
  if (!items.length) throw new Error(`${cfg.key} の施設が見つかりません`);
  const groupIdx = r => {
    const i = cfg.groups.findIndex(g => g.genres && g.genres.includes(r.spot.genre));
    return i >= 0 ? i : cfg.groups.findIndex(g => !g.genres);
  };
  // グループ内は、休業なし→休業あり、地域順、元の順
  const closedRank = r => closureText(r.spot) ? 1 : 0;
  items.sort((a, b) => closedRank(a) - closedRank(b) || PREF_ORDER.indexOf(a.spot.region) - PREF_ORDER.indexOf(b.spot.region));
  const groups = cfg.groups.map((g, gi) => Object.assign({ list: items.filter(r => groupIdx(r) === gi) }, g)).filter(g => g.list.length);

  const n = items.length;
  const prefs = PREF_ORDER.filter(p => items.some(r => r.spot.region === p));
  const prefList = prefs.join('・');
  const prefText = prefs.length > 3 ? (prefs.some(p => NEARBY.includes(p)) ? '関東・近県' : '関東') : prefList;
  const URL = `${SITE}event/${cfg.slug}/`;
  const title = cfg.title(prefText), desc = cfg.desc(prefText, n);

  const card = r => {
    const s = r.spot;
    const closed = closureText(s);
    const badges = [];
    const al = ageLabel(s);
    if (al) badges.push(`<span class="badge">👶 ${esc(al)}</span>`);
    badges.push(s.parking === 'yes' ? '<span class="badge">🚗 駐車場あり</span>' : '<span class="badge badge-off">🚗 駐車場なし</span>');
    const baby = (s.ages || []).includes('0-1歳') ? '1' : '0';
    const parking = s.parking === 'yes' ? '1' : '0';
    const status = closed ? esc(closed) : '年末年始も営業（時間は公式サイトで確認）';
    return `<li data-g="${groupIdx(r)}" data-parking="${parking}" data-baby="${baby}"><a href="${BASE}${r.slug}/">${esc(s.name)}<span class="fa-area">${esc(s.area)}</span><span class="ev-period${closed ? '' : ' ev-tentative'}">${cfg.emoji} ${status}</span><span class="badges">${badges.join('')}</span><span class="ev-note">${esc(descNote(s))}</span></a></li>`;
  };
  const groupHtml = groups.map(g => `<div class="region-block" id="${g.id}"><h2 class="region-title">${g.title}（${g.list.length}件）</h2><div class="region-sub">${g.sub}</div><ul class="facility-list">${g.list.map(card).join('')}</ul></div>`).join('');

  const ld1 = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'おでかけナビ', item: SITE }, { '@type': 'ListItem', position: 2, name: cfg.breadcrumb }] };
  const ld2 = { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.ldName, numberOfItems: n, itemListElement: items.map((r, k) => ({ '@type': 'ListItem', position: k + 1, name: r.spot.name, url: SITE + r.slug + '/' })) };
  const pyJson = v => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "');

  const nav = `<a class="season-nav-item current" href="${BASE}event/${cfg.slug}/">${cfg.navLabel}</a>`
    + cfg.navExtra.map(([l, p]) => `<a class="season-nav-item" href="${BASE}${p}">${l}</a>`).join('')
    + `<a class="season-nav-item" href="${BASE}${cfg.seasonLink[1]}">${cfg.seasonLink[0]}</a>`;
  const chips = [['all', 'すべて'], ...cfg.groupChips.map(c => ['g' + c.g, c.label]), ['parking', '🚗 駐車場あり'], ['baby', '👶 0〜1歳から']]
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
<div class="period-badge">${cfg.period}</div>
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
<div class="notice">${esc(cfg.notice)}</div>
${groupHtml}
<a class="cta" href="${BASE}?holiday=${cfg.ctaParam}">${cfg.ctaText}</a>
</div>
<footer>
  データ出典・運営者情報・免責事項は<a href="${BASE}">おでかけナビ トップページ</a>の「よくある質問」「運営者について」でご確認いただけます。<br>
  © おでかけナビ
</footer>
<script>${JS}</script>
</body>
</html>`;
  return { html, n, groups: groups.map(g => `${g.title}${g.list.length}`) };
}

const SLUGS = loadSlugOverrides(INDEX_PATH);
const spots = JSON.parse(fs.readFileSync(SPOTS_PATH, 'utf8'));
const r = buildPage(CFG, spots, SLUGS);
const out = path.join(OUT_DIR, 'event', CFG.slug, 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, r.html);
console.log(`${CFG.key}特集ページを生成しました: ${out}（${r.n}件・${r.groups.join(' / ')}）`);
