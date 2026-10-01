#!/usr/bin/env node
// おでかけナビ エリア特集ページ生成ツール
//   /{都道府県}/{エリア}/index.html を作る（例: /kanagawa/hakone-odawara/）。複数の市区町村をまとめた特集ページ。
//
// 使い方（リポジトリ直下で実行）:
//   node tools/build-area-pages.js --index index.html --spots data/spots.json --sitemap sitemap.xml --out _build_area
//   → _build_area/ にページ一式と sitemap.xml（既存sitemapに新ページを追記したもの）を作る。既存ファイルには触らない。
//
// 方針:
//   ・リンクするのは「sitemap.xml に載っている＝公開済みの施設ページ」だけ。未公開の施設は載せない。
//   ・見た目・フッターは tools/build-static-pages.js の地域ページと同じものを、そのファイルから読んで使う。
//   ・エリアを増やす・変える時は、下の AREAS を編集する（cities は「都道府県スラッグ/市区町村スラッグ」）。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const INDEX_PATH = opt('index', 'index.html');
const SPOTS_PATH = opt('spots', 'data/spots.json');
const SITEMAP_PATH = opt('sitemap', 'sitemap.xml');
const OUT_DIR = opt('out', '_build_area');
const STATIC_TOOL = opt('static-tool', path.join(__dirname, 'build-static-pages.js'));

// ------------------------------------------------------------------ 地域ページと同じ見た目の部品を build-static-pages.js から読む
function grab(lines, name) {
  const i = lines.findIndex(l => new RegExp('^(const|function)\\s+' + name + '\\b').test(l));
  if (i < 0) throw new Error('build-static-pages.js に見つかりません: ' + name);
  const first = lines[i];
  const count = (t, c) => t.split(c).length - 1;
  // 1行で完結している宣言（括弧が釣り合っていて、バッククォートが開きっぱなしでない）
  if (/[;}]\s*(\/\/.*)?$/.test(first) && count(first, '{') === count(first, '}') && count(first, '`') % 2 === 0) return first;
  const endRe = /^function\s/.test(first) ? /^\}\s*$/ : /^(`;|\];|\};)\s*$/;
  let j = i + 1;
  while (j < lines.length && !endRe.test(lines[j])) j++;
  return lines.slice(i, j + 1).join('\n');
}
const tl = fs.readFileSync(STATIC_TOOL, 'utf8').split('\n');
const helperCode = ['SITE', 'BASE', 'esc', 'pyJson', 'cmp', 'CSS_REGION', 'FOOTER', 'head', 'breadcrumbLd', 'itemListLd']
  .map(n => grab(tl, n)).join('\n') +
  '\nthis.__h = { SITE, BASE, esc, cmp, CSS_REGION, FOOTER, head, breadcrumbLd, itemListLd };';
const hsb = {}; vm.createContext(hsb); vm.runInContext(helperCode, hsb);
const { SITE, BASE, esc, cmp, CSS_REGION, FOOTER, head, breadcrumbLd, itemListLd } = hsb.__h;

// ------------------------------------------------------------------ 施設のURL(slug)を、index.html（圧縮形式でも可）から取り出す
function loadSlugs() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const a = html.search(/const SPOTS\s*=\s*window\.__ODEKAKE_DATA__\.spots;/);
  const m = /function spotBySlug\(slug\)\s*\{[^}]*\}/.exec(html);
  if (a < 0 || !m) throw new Error('index.html から施設URLの生成部分が見つかりません');
  const sb = { window: { __ODEKAKE_DATA__: { spots: JSON.parse(fs.readFileSync(SPOTS_PATH, 'utf8')) } },
    document: { title: '', querySelector: () => null, getElementById: () => null } };
  vm.createContext(sb);
  vm.runInContext('function deriveCategory(){}function deriveRainLevel(){}function deriveWalletLevel(){}function deriveActivityLevel(){}', sb);
  vm.runInContext(html.slice(a, m.index + m[0].length) + '\nthis.__app = { SPOTS, spotSlug, baseMunicipality };', sb);
  return sb.__app;
}

// ------------------------------------------------------------------ エリアの定義
const has = (s, w) => String(s || '').includes(w);
const AREAS = [
  { pref: 'kanagawa', slug: 'hakone-odawara', name: '箱根・小田原', cities: ['kanagawa/hakone', 'kanagawa/odawara', 'kanagawa/yugawara', 'kanagawa/manazuru'] },
  { pref: 'kanagawa', slug: 'yokosuka-miura', name: '横須賀・三浦', cities: ['kanagawa/yokosuka', 'kanagawa/miura'] },
  { pref: 'tokyo', slug: 'tama-area', name: '多摩・八王子', cities: ['tokyo/hachioji', 'tokyo/machida', 'tokyo/tachikawa', 'tokyo/tama', 'tokyo/inagi', 'tokyo/musashino', 'tokyo/chofu', 'tokyo/koganei', 'tokyo/fuchu', 'tokyo/higashikurume', 'tokyo/hino', 'tokyo/akiruno', 'tokyo/nishitokyo', 'tokyo/okutama', 'tokyo/higashiyamato'] },
  { pref: 'tokyo', slug: 'tokyo-bay', name: '東京ベイ（お台場・豊洲・葛西）', partial: true,
    cities: ['tokyo/koto', 'tokyo/minato', 'tokyo/edogawa'],
    filter: (spot, cityKey) => cityKey === 'tokyo/koto' || (cityKey === 'tokyo/minato' && (has(spot.area, 'お台場') || has(spot.name, 'お台場'))) || (cityKey === 'tokyo/edogawa' && (has(spot.area, '葛西') || has(spot.name, '葛西'))),
    lead: '江東区（豊洲・有明・夢の島など）、港区のお台場、江戸川区の葛西エリア' },
  { pref: 'chiba', slug: 'urayasu-makuhari', name: '浦安・幕張・船橋', cities: ['chiba/urayasu', 'chiba/chiba-mihama', 'chiba/funabashi', 'chiba/narashino'] },
  { pref: 'chiba', slug: 'boso', name: '房総（アクアライン・南房総）', cities: ['chiba/kisarazu', 'chiba/kimitsu', 'chiba/futtsu', 'chiba/sodegaura', 'chiba/ichihara', 'chiba/tateyama', 'chiba/minamiboso', 'chiba/kamogawa', 'chiba/kyonan'] },
  { pref: 'saitama', slug: 'kawagoe-tokorozawa-hanno', name: '川越・所沢・飯能', cities: ['saitama/kawagoe', 'saitama/tokorozawa', 'saitama/hanno', 'saitama/hidaka', 'saitama/sayama'] },
  { pref: 'saitama', slug: 'chichibu-nagatoro', name: '秩父・長瀞', cities: ['saitama/chichibu', 'saitama/nagatoro', 'saitama/yokoze', 'saitama/higashichichibu'] },
  { pref: 'ibaraki', slug: 'tsukuba-tsuchiura', name: 'つくば・土浦', cities: ['ibaraki/tsukuba', 'ibaraki/tsuchiura', 'ibaraki/ishioka', 'ibaraki/inashiki', 'ibaraki/ushiku', 'ibaraki/toride', 'ibaraki/moriya', 'ibaraki/kasumigaura'] },
  { pref: 'ibaraki', slug: 'mito-oarai', name: '水戸・大洗・日立', cities: ['ibaraki/mito', 'ibaraki/oarai', 'ibaraki/kasama', 'ibaraki/hitachinaka', 'ibaraki/hitachi', 'ibaraki/hitachiota', 'ibaraki/takahagi'] },
  { pref: 'tochigi', slug: 'nasu-shiobara', name: '那須・塩原', cities: ['tochigi/nasu', 'tochigi/nasushiobara'] },
  { pref: 'nagano', slug: 'karuizawa-saku', name: '軽井沢・佐久', cities: ['nagano/karuizawa', 'nagano/saku', 'gunma/tsumagoi', 'gunma/naganohara'] },
  { pref: 'gunma', slug: 'minakami-kusatsu', name: 'みなかみ・草津・伊香保', cities: ['gunma/minakami', 'gunma/kusatsu', 'gunma/shibukawa', 'gunma/kawaba', 'gunma/numata'] },
  { pref: 'yamanashi', slug: 'fuji-sanroku', name: '富士山麓（河口湖・御殿場）', cities: ['yamanashi/fujikawaguchiko', 'yamanashi/yamanakako', 'yamanashi/oshino', 'yamanashi/narusawa', 'yamanashi/fujiyoshida', 'shizuoka/gotemba', 'shizuoka/susono'] },
  { pref: 'shizuoka', slug: 'izu', name: '伊豆・熱海', cities: ['shizuoka/ito', 'shizuoka/atami', 'shizuoka/kawazu', 'shizuoka/kannami', 'shizuoka/higashiizu', 'shizuoka/izu-city', 'shizuoka/izunokuni', 'shizuoka/shimoda', 'shizuoka/numazu', 'shizuoka/mishima', 'shizuoka/nagaizumi'] },
];
const PREF_FULL = { tokyo: '東京都', kanagawa: '神奈川県', saitama: '埼玉県', chiba: '千葉県', ibaraki: '茨城県', tochigi: '栃木県', gunma: '群馬県', yamanashi: '山梨県', shizuoka: '静岡県', nagano: '長野県', fukushima: '福島県' };
const MIN_SPOTS = 6; // これ未満のエリアは作らない

// ------------------------------------------------------------------ 生成
const app = loadSlugs();
const smText = fs.readFileSync(SITEMAP_PATH, 'utf8');
const published = new Set([...smText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => decodeURI(x[1].replace(SITE, ''))));
const cityDisp = b => (b.indexOf('郡') !== -1 ? b.replace(/^.+?郡/, '') : b);

const rows = [];
app.SPOTS.forEach(spot => {
  const slug = app.spotSlug(spot);
  if (!published.has(slug + '/')) return; // 公開済みの施設ページだけ
  const seg = slug.split('/');
  rows.push({ spot, slug, cityKey: seg[0] + '/' + seg[1] });
});

const out = new Map();
const report = [];
const used = new Set();
AREAS.forEach(area => {
  const dest = `${area.pref}/${area.slug}`;
  if (published.has(dest + '/')) throw new Error('既存ページと重複します: ' + dest);
  if (used.has(dest)) throw new Error('エリアのスラッグが重複: ' + dest); used.add(dest);
  const byCity = new Map();
  area.cities.forEach(k => byCity.set(k, []));
  rows.forEach(r => {
    if (!byCity.has(r.cityKey)) return;
    if (area.filter && !area.filter(r.spot, r.cityKey)) return;
    byCity.get(r.cityKey).push(r);
  });
  const groups = [...byCity.entries()].filter(([, v]) => v.length).map(([k, v]) => ({
    key: k, rows: v.slice().sort((a, b) => cmp(a.spot.name, b.spot.name)),
    name: cityDisp(app.baseMunicipality((v[0].spot.area || '').split('・')[0])),
    exists: published.has(k + '/')
  })).sort((a, b) => (b.rows.length - a.rows.length) || cmp(a.key, b.key));
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total < MIN_SPOTS) { report.push(`SKIP ${dest}（${total}件）`); return; }

  const url = `${SITE}${dest}/`;
  const prefFull = PREF_FULL[area.pref];
  const title = `${area.name}の子連れお出かけスポット｜おでかけナビ`;
  const lead = area.lead || groups.map(g => g.name).join('・');
  const description = `${area.name}の子連れお出かけスポットをまとめて紹介。${lead}の${total}件を掲載。料金・駐車場・アクセスなどの詳しい情報も見られます。`;
  const crumbs = [['おでかけナビ', SITE], [prefFull, `${SITE}${area.pref}/`], [area.name]];
  const all = groups.flatMap(g => g.rows);
  const ld1 = breadcrumbLd(crumbs);
  const ld2 = itemListLd(`${area.name}の子連れお出かけスポット一覧`, all.map(r => [r.spot.name, `${SITE}${r.slug}/`]));
  const A = (href, inner) => `<a href="${href}">${inner}</a>`;
  const li = r => `<li><a href="${BASE}${r.slug}/">${esc(r.spot.name)}<span class="fa-area">${esc(r.spot.area)}</span></a></li>`;
  let h = head(title, description, url, [ld1, ld2], CSS_REGION, true);
  h += `<nav class="breadcrumb">${A(SITE, 'おでかけナビ')} ／ ${A(`${SITE}${area.pref}/`, esc(prefFull))} ／ ${esc(area.name)}</nav>\n`;
  h += `<h1>📍${esc(area.name)}の子連れお出かけスポット</h1>\n<div class="count-badge">登録スポット数：${total}件</div>\n`;
  h += `<p class="intro">${esc(lead)}の子連れお出かけスポットを、エリアまとめて探せる特集ページです。「おでかけナビ」に登録されている${total}件を掲載しています。</p>\n`;
  if (!area.partial) {
    const cards = groups.filter(g => g.exists);
    if (cards.length > 1) {
      h += `<h2 class="section-title">📍 市区町村から探す</h2><div class="link-grid">${cards.map(g => `<a class="link-card" href="${BASE}${g.key}/"><span class="lc-name">${esc(g.name)}</span><span class="lc-count">${g.rows.length}件</span></a>`).join('')}</div>\n`;
    }
  }
  groups.forEach(g => { h += `<h2 class="section-title">🏞️ ${esc(g.name)}（${g.rows.length}件）</h2><ul class="facility-list">${g.rows.map(li).join('')}</ul>\n`; });
  h += `<a class="cta" href="${BASE}">🧭 おでかけナビで検索・絞り込みして探す</a>\n</div>\n` + FOOTER;
  out.set(`${dest}/index.html`, h);
  report.push(`OK   ${dest}  ${total}件  ${groups.length}市区町村  ${area.name}`);
});

// 既存sitemapに追記（既存の書式に合わせる）
const adds = [...out.keys()].map(f => `<url><loc>${SITE}${encodeURI(f.replace(/index\.html$/, ''))}</loc></url>`);
let sm = smText.replace(/\s*<\/urlset>\s*$/, '\n' + adds.join('\n') + '\n</urlset>\n');
out.set('sitemap.xml', sm);
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [rel, body] of out) { const p = path.join(OUT_DIR, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
console.log(report.join('\n'));
console.log(`\n${adds.length} ページを ${OUT_DIR}/ に生成しました（sitemap.xml も更新済み）`);
