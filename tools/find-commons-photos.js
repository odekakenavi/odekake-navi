#!/usr/bin/env node
/**
 * 施設写真の候補探しツール（Wikimedia Commons）
 *
 * 使い方（リポジトリのルートで、Node.js 18以上）:
 *   node tools/find-commons-photos.js --spots site/data/spots.json
 *   node tools/find-commons-photos.js --only 動物園 --limit 20     # 一部だけ試す
 *   node tools/find-commons-photos.js --resume                      # 途中から再開
 *
 * 出力: photo-work/candidates.json と photo-work/review.html
 * review.html をブラウザで開いて採用する写真を選び、「選択を書き出す」で
 * photo-choices.json を保存 → tools/apply-photos.js で反映します。
 *
 * 候補にするのは自由なライセンス（CC0 / パブリックドメイン / CC BY / CC BY-SA）のみ。
 * 位置情報（座標）が施設と近い写真には「位置一致」が付きます。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const UA = 'odekakenavi-photo-finder/1.0 (https://odekakenavi.github.io/odekake-navi/; personal project)';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const JAWIKI = 'https://ja.wikipedia.org/w/api.php';
const MAX_PER_SPOT = 4;
const MIN_WIDTH = 800;
const GEO_OK_KM = 3;
const GEO_NG_KM = 8;

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}
const args = parseArgs(process.argv.slice(2));
const SPOTS = args.spots || (fs.existsSync('index.html') ? ['data/spots.json', 'site/data/spots.json'] : ['site/data/spots.json', 'data/spots.json']).find(p => fs.existsSync(p));
const OUTDIR = args.out || 'photo-work';
if (!SPOTS || !fs.existsSync(SPOTS)) {
  console.error('spots.json が見つかりません。--spots でパスを指定してください。');
  process.exit(1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripTags = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s・･\-_()（）「」]/g, '');
function haversineKm(a, b, c, d) {
  const R = 6371, t = x => x * Math.PI / 180;
  const dLat = t(c - a), dLng = t(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function coreName(name) {
  return String(name).replace(/[（(].*?[）)]/g, '').replace(/[【\[].*?[】\]]/g, '').replace(/\s+/g, ' ').trim();
}
const LICENSE_OK = /^(CC0|Public domain|PD[ -]|CC BY(-SA)? [1-4]\.\d)/i;
const LICENSE_NG = /(NC|ND|GFDL only|fair use)/i;
function licenseAllowed(short) {
  const s = String(short || '').trim();
  return LICENSE_OK.test(s) && !LICENSE_NG.test(s);
}

async function api(base, params) {
  const url = base + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let t = 0; t < 4; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (t + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (t === 3) throw e;
      await sleep(1000 * (t + 1));
    }
  }
}

const IMAGEINFO = {
  prop: 'imageinfo|coordinates',
  iiprop: 'url|size|mime|extmetadata',
  iiurlwidth: '800',
  iiextmetadatalanguage: 'ja',
  iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription|Restrictions|AttributionRequired',
  colimit: '50'
};

function toCandidate(page, source) {
  const ii = page.imageinfo && page.imageinfo[0];
  if (!ii) return null;
  if (!/^image\/(jpeg|png)$/.test(ii.mime || '')) return null;
  if ((ii.width || 0) < MIN_WIDTH) return null;
  const md = ii.extmetadata || {};
  const lic = md.LicenseShortName && md.LicenseShortName.value;
  if (!licenseAllowed(lic)) return null;
  const restr = stripTags(md.Restrictions && md.Restrictions.value);
  const coord = page.coordinates && page.coordinates[0];
  return {
    fileTitle: page.title,
    pageUrl: ii.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'))),
    thumbUrl: ii.thumburl || ii.url,
    thumbWidth: ii.thumbwidth || null,
    thumbHeight: ii.thumbheight || null,
    width: ii.width, height: ii.height, mime: ii.mime,
    license: stripTags(lic),
    licenseUrl: stripTags(md.LicenseUrl && md.LicenseUrl.value),
    artist: stripTags(md.Artist && md.Artist.value).slice(0, 80),
    desc: stripTags(md.ImageDescription && md.ImageDescription.value).slice(0, 140),
    restrictions: restr,
    lat: coord ? coord.lat : null, lng: coord ? coord.lon : null,
    source
  };
}

// A: 日本語版Wikipediaの記事（座標が施設の近く）の代表画像
async function fromJawiki(spot, core) {
  const out = [];
  const j = await api(JAWIKI, {
    action: 'query', generator: 'search', gsrsearch: core, gsrlimit: '3',
    prop: 'pageimages|coordinates', piprop: 'name', pilimit: '3', colimit: '3'
  });
  const pages = (j.query && j.query.pages) || [];
  const names = [];
  for (const p of pages) {
    if (!p.pageimage) continue;
    const c = p.coordinates && p.coordinates[0];
    const titleMatch = norm(p.title).includes(norm(core)) || norm(core).includes(norm(p.title));
    let ok = false;
    if (c && typeof spot.lat === 'number') ok = haversineKm(spot.lat, spot.lng, c.lat, c.lon) <= GEO_OK_KM;
    else ok = titleMatch;
    if (ok) names.push('File:' + p.pageimage.replace(/_/g, ' '));
  }
  if (!names.length) return out;
  await sleep(250);
  const k = await api(COMMONS, { action: 'query', titles: names.join('|'), ...IMAGEINFO });
  for (const p of (k.query && k.query.pages) || []) {
    if (p.missing) continue;
    const cand = toCandidate(p, 'wikipedia');
    if (cand) out.push(cand);
  }
  return out;
}

// B: Commonsのファイル検索
async function fromCommons(spot, core, extra) {
  const q = (extra ? core + ' ' + extra : core) + ' filetype:bitmap';
  const j = await api(COMMONS, {
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '15', gsrsearch: q, ...IMAGEINFO
  });
  const out = [];
  for (const p of (j.query && j.query.pages) || []) {
    const cand = toCandidate(p, 'commons');
    if (cand) out.push(cand);
  }
  return out;
}

function score(spot, core, cand) {
  const n = norm(core);
  let s = cand.source === 'wikipedia' ? 60 : 0;
  const hay = norm(cand.fileTitle + ' ' + cand.desc);
  if (norm(cand.fileTitle).includes(n)) s += 40;
  else if (hay.includes(n)) s += 20;
  let geo = 'unknown';
  if (cand.lat != null && typeof spot.lat === 'number') {
    const km = haversineKm(spot.lat, spot.lng, cand.lat, cand.lng);
    if (km <= GEO_OK_KM) { geo = 'match'; s += 40; }
    else if (km >= GEO_NG_KM) { geo = 'far'; s -= 100; }
    else { geo = 'near'; s += 5; }
  }
  if (cand.width >= 1600) s += 3;
  cand.geo = geo;
  cand.score = s;
  return s;
}

async function main() {
  const spots = JSON.parse(fs.readFileSync(SPOTS, 'utf8'));
  fs.mkdirSync(OUTDIR, { recursive: true });
  const candPath = path.join(OUTDIR, 'candidates.json');
  let results = {};
  if (args.resume && fs.existsSync(candPath)) results = JSON.parse(fs.readFileSync(candPath, 'utf8')).results || {};

  let list = spots.filter(s => s.slug && !s.image);
  if (args.only && args.only !== true) {
    const t = String(args.only);
    list = list.filter(s => (s.name + ' ' + (s.area || '') + ' ' + (s.region || '')).includes(t));
  }
  if (args.limit) list = list.slice(0, Number(args.limit));
  list = list.filter(s => !(args.resume && results[s.slug]));
  console.log(`対象 ${list.length} 件（写真未設定の施設）`);

  let n = 0;
  for (const spot of list) {
    n++;
    const core = coreName(spot.name);
    let cands = [];
    try {
      cands = cands.concat(await fromJawiki(spot, core));
      await sleep(250);
      cands = cands.concat(await fromCommons(spot, core));
      if (cands.length < 2 && spot.area) {
        await sleep(250);
        cands = cands.concat(await fromCommons(spot, core, String(spot.area).split(/[ 　・,、]/)[0]));
      }
    } catch (e) {
      console.warn(`  ! ${spot.name}: ${e.message}`);
    }
    const seen = new Set();
    cands = cands.filter(c => !seen.has(c.fileTitle) && seen.add(c.fileTitle));
    cands.forEach(c => score(spot, core, c));
    cands = cands.filter(c => c.score >= 40).sort((a, b) => b.score - a.score).slice(0, MAX_PER_SPOT);
    results[spot.slug] = { name: spot.name, area: spot.area || '', region: spot.region || '', candidates: cands };
    console.log(`[${n}/${list.length}] ${spot.name}: ${cands.length}件`);
    if (n % 10 === 0) fs.writeFileSync(candPath, JSON.stringify({ results }, null, 1));
    await sleep(300);
  }
  fs.writeFileSync(candPath, JSON.stringify({ results }, null, 1));
  fs.writeFileSync(path.join(OUTDIR, 'review.html'), buildReview(results));
  const hit = Object.values(results).filter(r => r.candidates.length).length;
  console.log(`\n完了: 候補あり ${hit} / ${Object.keys(results).length} 件`);
  console.log(`次は ${path.join(OUTDIR, 'review.html')} をブラウザで開いて写真を選んでください。`);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function buildReview(results) {
  const rows = Object.entries(results).filter(([, r]) => r.candidates.length);
  const cards = rows.map(([slug, r]) => `
<section class="spot" data-slug="${esc(slug)}">
  <h2>${esc(r.name)} <small>${esc(r.region)} ${esc(r.area)}</small></h2>
  <div class="cands">
    ${r.candidates.map((c, i) => `
    <label class="cand">
      <input type="radio" name="p-${esc(slug)}" value="${esc(c.fileTitle)}">
      <div class="frame"><img loading="lazy" src="${esc(c.thumbUrl)}" alt=""></div>
      <div class="meta">
        <span class="tag ${c.geo}">${c.geo === 'match' ? '位置一致' : c.geo === 'near' ? '位置やや近い' : '位置未確認'}</span>
        <span class="tag src">${c.source === 'wikipedia' ? 'Wikipedia代表画像' : 'Commons検索'}</span><br>
        ${esc(c.license)} ／ ${esc(c.artist) || '作者不明'}<br>
        <a href="${esc(c.pageUrl)}" target="_blank" rel="noopener">${esc(c.fileTitle.replace(/^File:/, '').slice(0, 48))}</a>
        ${c.restrictions ? `<br><b class="warn">制限: ${esc(c.restrictions.slice(0, 60))}</b>` : ''}
      </div>
    </label>`).join('')}
    <label class="cand none"><input type="radio" name="p-${esc(slug)}" value="" checked><div class="meta">採用しない</div></label>
  </div>
</section>`).join('\n');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>施設写真の候補レビュー</title>
<style>
body{font-family:system-ui,"Noto Sans JP",sans-serif;margin:0;background:#faf7ef;color:#2b2620}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;z-index:5;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{padding:8px 14px;border-radius:8px;border:0;background:#e2603a;color:#fff;font-weight:700;cursor:pointer}
main{padding:12px 16px;max-width:1100px;margin:0 auto}
.spot{background:#fff;border:1px solid #e7dfcf;border-radius:12px;padding:12px;margin-bottom:14px}
.spot h2{font-size:16px;margin:0 0 8px}.spot small{color:#6b6259;font-weight:400;font-size:12px}
.cands{display:flex;gap:10px;flex-wrap:wrap}
.cand{display:block;width:260px;border:2px solid #e7dfcf;border-radius:10px;padding:6px;cursor:pointer}
.cand:has(input:checked){border-color:#e2603a;background:#fff4ee}
.cand.none{width:110px;display:flex;align-items:center;justify-content:center}
.frame{width:100%;aspect-ratio:3.27/1;background:#eee;border-radius:8px;overflow:hidden;display:flex;justify-content:center}
.frame img{height:100%;max-width:100%;object-fit:contain}
.meta{font-size:11px;line-height:1.6;margin-top:6px;word-break:break-all}
.tag{display:inline-block;border-radius:999px;padding:1px 8px;font-size:10.5px;background:#eee}
.tag.match{background:#dcebd1;color:#3d6b2c}.tag.far{background:#f8dad3}.tag.src{background:#e8f0f6}
.warn{color:#a33b2c}
</style></head><body>
<header><b>施設写真の候補レビュー</b><span id="cnt"></span>
<label><input type="checkbox" id="onlyUnsel"> 未選択のみ表示</label>
<button id="save">選択を書き出す（photo-choices.json）</button></header>
<main>${cards || '<p>候補が見つかりませんでした。</p>'}</main>
<script>
const KEY='odekake-photo-choices-v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
document.querySelectorAll('.spot').forEach(sec=>{
  const slug=sec.dataset.slug;
  if(saved[slug]){const r=[...sec.querySelectorAll('input')].find(i=>i.value===saved[slug]);if(r)r.checked=true}
  sec.addEventListener('change',()=>{const v=sec.querySelector('input:checked').value;saved[slug]=v;try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}count();filter()});
});
function chosen(){return [...document.querySelectorAll('.spot')].map(s=>({slug:s.dataset.slug,fileTitle:s.querySelector('input:checked').value})).filter(x=>x.fileTitle)}
function count(){document.getElementById('cnt').textContent='採用 '+chosen().length+' 件'}
function filter(){const on=document.getElementById('onlyUnsel').checked;document.querySelectorAll('.spot').forEach(s=>{s.style.display=on&&s.querySelector('input:checked').value?'none':''})}
document.getElementById('onlyUnsel').onchange=filter;
document.getElementById('save').onclick=()=>{const b=new Blob([JSON.stringify(chosen(),null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='photo-choices.json';a.click()};
count();
</script></body></html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
