#!/usr/bin/env node
/**
 * 公開前の自動チェック。ファイルは一切書き換えない。
 *   node tools/check-site.js                    … データだけ確認（data/*.json）
 *   node tools/check-site.js --public _public   … データ＋公開用フォルダ（sitemap・ページ・リンク）も確認
 *
 * ✗（エラー）が1つでもあると終了コード1 → GitHub Actions はそこで止まり、公開されない（いま公開中のサイトはそのまま）。
 * ⚠（注意）は公開は止めず、Actions の結果画面に一覧で出すだけ。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const pubArg = (i => (i >= 0 && argv[i + 1]) ? argv[i + 1] : null)(argv.indexOf('--public'));
const PUB = pubArg ? path.resolve(ROOT, pubArg) : null;
const SITE = 'https://odekakenavi.github.io/odekake-navi/';
const BASE = '/odekake-navi/';
const PREFS = ['tokyo', 'kanagawa', 'saitama', 'chiba', 'ibaraki', 'tochigi', 'gunma', 'yamanashi', 'shizuoka', 'fukushima', 'nagano'];

const errors = [], warns = [], oks = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m), ok = (m) => oks.push(m);
const list = (arr, max = 10) => arr.slice(0, max).join(' / ') + (arr.length > max ? ` …ほか${arr.length - max}件` : '');
const dups = (arr) => { const s = new Set(), d = new Set(); arr.forEach(x => s.has(x) ? d.add(x) : s.add(x)); return [...d]; };

function readJson(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { err(`${rel} がありません`); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { err(`${rel} がJSONとして壊れています（カンマ抜け・カッコ閉じ忘れなど）: ${e.message}`); return null; }
}

// ================================================================== 1) 施設データ
const spots = readJson('data/spots.json');
if (spots) {
  if (!Array.isArray(spots) || spots.length < 100) err(`data/spots.json の件数が異常です（${Array.isArray(spots) ? spots.length : '配列ではない'}）`);
  else {
    const empty = (v) => v === undefined || v === null || v === '';
    const core = ['region', 'name', 'slug', 'area'];
    const lackCore = spots.filter(s => core.some(k => empty(s[k]))).map(s => `${s.name || '(名前なし)'}［${core.filter(k => empty(s[k])).join(',')}］`);
    lackCore.length ? err('必須項目（region/name/slug/area）が空の施設: ' + list(lackCore)) : ok(`施設 ${spots.length}件：必須項目（region/name/slug/area）あり`);
    const info = ['ages', 'weather', 'duration', 'price', 'parking', 'access', 'desc'];
    const lackInfo = spots.filter(s => info.some(k => empty(s[k]))).map(s => `${s.name}［${info.filter(k => empty(s[k])).join(',')}］`);
    if (lackInfo.length) warn(`基本情報が空の施設 ${lackInfo.length}件（表示は「要確認」等になります）: ` + list(lackInfo));

    const dn = dups(spots.map(s => s.name)); dn.length ? err('施設名が重複: ' + list(dn)) : ok('施設名の重複なし');
    const ds = dups(spots.map(s => s.slug)); ds.length ? err('slug（URL）が重複: ' + list(ds)) : ok('slugの重複なし');

    const badSlug = spots.filter(s => typeof s.slug === 'string' && (!PREFS.includes(s.slug.split('/')[0]) || s.slug.split('/').length !== 3 || /[\s?#%"'<>\\]/.test(s.slug))).map(s => `${s.name}→${s.slug}`);
    badSlug.length ? err('slugの形が不正（「都道府県/市区町村/施設」の3段・空白や記号なし）: ' + list(badSlug)) : ok('slugの形はすべて正常');

    const inJapan = (s) => typeof s.lat === 'number' && typeof s.lng === 'number' && s.lat > 24 && s.lat < 46 && s.lng > 122 && s.lng < 154;
    const badGeo = spots.filter(s => !(s.lat == null && s.lng == null) && !inJapan(s)).map(s => `${s.name}(${s.lat},${s.lng})`);
    badGeo.length ? err('緯度経度が日本の範囲外・数値でない（緯度と経度の逆転に注意）: ' + list(badGeo)) : ok('緯度経度はすべて日本の範囲内');
    const noPlace = spots.filter(s => s.lat == null && !s.address).map(s => s.name);
    noPlace.length ? err('座標も住所(address)も無い施設（地図に出せない）: ' + list(noPlace)) : ok('座標なしの施設には住所あり');

    const badUrl = [];
    spots.forEach(s => {
      if (s.officialUrl && !/^https?:\/\/\S+$/.test(s.officialUrl)) badUrl.push(`${s.name}（公式URL）`);
      (Array.isArray(s.bookingLinks) ? s.bookingLinks : []).forEach(b => { if (b && b.url && !/^https?:\/\/\S+$/.test(b.url)) badUrl.push(`${s.name}（予約リンク）`); });
    });
    badUrl.length ? err('URLの形が不正（http/https で始まらない・空白を含む）: ' + list(badUrl)) : ok('公式URL・予約リンクの形は正常');

    // verifiedAt は「2026-10-02」「2026年10月2日」のどちらでも読む
    const toIso = (v) => { if (!v) return null; const m = String(v).match(/^(\d{4})[-年\/](\d{1,2})[-月\/](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : 'bad'; };
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const badDate = spots.filter(s => { const d = toIso(s.verifiedAt); return d && (d === 'bad' || d > today); }).map(s => `${s.name}(${s.verifiedAt})`);
    if (badDate.length) warn('verifiedAt が日付として読めない、または未来日: ' + list(badDate));
    const yearAgo = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
    const old = spots.filter(s => { const d = toIso(s.verifiedAt); return d && d !== 'bad' && d < yearAgo; }).length;
    if (old) warn(`最終確認（verifiedAt）が1年以上前の施設が ${old}件あります（料金・営業時間の見直し候補）`);
  }
}

// ================================================================== 2) ホテルデータ
const hotels = readJson('data/hotels.json');
if (hotels) {
  const fh = hotels.familyHotels;
  if (!fh || typeof fh !== 'object') err('data/hotels.json に familyHotels がありません');
  else {
    const all = Object.entries(fh).flatMap(([area, arr]) => (Array.isArray(arr) ? arr : []).map(h => ({ area, ...h })));
    const meta = hotels.areaMeta || {};
    const noMeta = Object.keys(fh).filter(a => !meta[a]); noMeta.length ? err('areaMeta が無いホテルエリア: ' + list(noMeta)) : ok(`ホテル ${all.length}件・${Object.keys(fh).length}エリア：エリア情報あり`);
    const lack = all.filter(h => !h.name || !h.slug).map(h => h.name || `(名前なし／${h.area})`); lack.length ? err('name/slug が無いホテル: ' + list(lack)) : ok('全ホテルに name/slug あり');
    const ds = dups(all.map(h => h.slug).filter(Boolean)); ds.length ? err('ホテルのslugが重複: ' + list(ds)) : ok('ホテルslugの重複なし');
    const badUrl = all.flatMap(h => (h.bookingLinks || []).filter(b => !b || !/^https?:\/\/\S+$/.test(b.url || '')).map(() => h.name));
    badUrl.length ? err('予約リンクのURLが不正なホテル: ' + list([...new Set(badUrl)])) : ok('ホテル予約リンクの形は正常');
    const badGeo = all.filter(h => h.lat != null && !(h.lat > 24 && h.lat < 46 && h.lng > 122 && h.lng < 154)).map(h => h.name);
    badGeo.length ? err('ホテルの緯度経度が日本の範囲外: ' + list(badGeo)) : ok('ホテルの緯度経度は正常');
  }
}

// ================================================================== 3) イベントデータ
const ev = readJson('data/event-data.json');
if (ev && spots && Array.isArray(spots)) {
  const names = new Set(spots.map(s => s.name));
  const unknown = Object.keys(ev).filter(n => !names.has(n));
  unknown.length ? warn('event-data.json にあるが spots.json に無い施設名（名前が変わった？）: ' + list(unknown)) : ok('イベントデータの施設名はすべて spots.json にある');
}

// ================================================================== 4) 公開用フォルダ
if (PUB) {
  if (!fs.existsSync(PUB)) err('公開用フォルダがありません: ' + PUB);
  else {
    for (const r of ['index.html', 'data/spots.json', 'data/hotels.json', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml', 'robots.txt', '404.html'])
      if (!fs.existsSync(path.join(PUB, r))) err('必須ファイルがありません: /' + r);

    const robots = fs.existsSync(path.join(PUB, 'robots.txt')) ? fs.readFileSync(path.join(PUB, 'robots.txt'), 'utf8') : '';
    if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) warn('robots.txt に「Disallow: /」があります（そのボットにはサイト全体が巡回されません）');
    if (!robots.includes('Sitemap: ' + SITE + 'sitemap.xml')) err('robots.txt に Sitemap の行（完全URL）がありません');

    const sm = fs.existsSync(path.join(PUB, 'sitemap.xml')) ? fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8') : '';
    if (!/^<\?xml[\s\S]*<urlset[\s\S]*<\/urlset>\s*$/.test(sm)) err('sitemap.xml の形が壊れています');
    const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
    const fileFor = u => { const p = decodeURI(u.slice(SITE.length)); return p === '' ? 'index.html' : (p.endsWith('/') ? p + 'index.html' : p); };
    const outside = locs.filter(u => !u.startsWith(SITE)); if (outside.length) err('sitemap に別サイトのURL: ' + list(outside));
    const amp = locs.filter(u => /&(?!amp;)/.test(u)); if (amp.length) err('sitemap の & がエスケープされていません: ' + list(amp));
    const ld = dups(locs); ld.length ? err('sitemap のURLが重複: ' + list(ld.map(u => decodeURI(u.slice(SITE.length))))) : null;
    const missing = locs.filter(u => u.startsWith(SITE) && !fs.existsSync(path.join(PUB, fileFor(u.replace(/&amp;/g, '&')))));
    missing.length ? err(`sitemap にあるのにページが無いURL（Googleには404に見える）: ${missing.length}件 ` + list(missing.map(u => decodeURI(u.slice(SITE.length))))) : ok(`sitemap の ${locs.length} URL はすべてページあり`);

    // sitemap に載っている各ページ：canonical が自分自身／noindex が無い／title がある
    const badCanon = [], noidx = [], noTitle = [];
    for (const u of locs) {
      const f = path.join(PUB, fileFor(u.replace(/&amp;/g, '&')));
      if (!f.endsWith('.html') || !fs.existsSync(f)) continue;
      const h = fs.readFileSync(f, 'utf8').slice(0, 20000);
      const c = (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
      if (c && decodeURI(c.replace(/&amp;/g, '&')) !== decodeURI(u.replace(/&amp;/g, '&'))) badCanon.push(decodeURI(u.slice(SITE.length)) + ' → ' + decodeURI(c));
      if (/<meta name="robots" content="[^"]*noindex/i.test(h)) noidx.push(decodeURI(u.slice(SITE.length)));
      if (!/<title>[^<]+<\/title>/.test(h)) noTitle.push(decodeURI(u.slice(SITE.length)));
    }
    noidx.length ? err('sitemap に載せているのに noindex のページ: ' + list(noidx)) : ok('sitemap のページに noindex なし');
    badCanon.length ? warn('canonical が自分のURLと違うページ: ' + list(badCanon)) : ok('canonical はすべて自分自身');
    if (noTitle.length) warn('title が空のページ: ' + list(noTitle));

    // サイト内リンク切れ（/odekake-navi/… へのリンクで、ファイルが無いもの）
    const broken = new Map();
    (function rec(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { rec(p); continue; }
        if (!e.name.endsWith('.html') || e.name === '404.html') continue;
        const h = fs.readFileSync(p, 'utf8');
        for (const m of h.matchAll(/href="(?:https:\/\/odekakenavi\.github\.io)?(\/odekake-navi\/[^"#?]*)"/g)) {
          let t = m[1].slice(BASE.length).replace(/&amp;/g, '&');
          try { t = decodeURI(t); } catch (_) {}
          const tf = t === '' ? 'index.html' : (t.endsWith('/') ? t + 'index.html' : t);
          if (!fs.existsSync(path.join(PUB, tf))) { const k = '/' + t; broken.set(k, (broken.get(k) || 0) + 1); }
        }
      }
    })(PUB);
    if (broken.size) warn(`サイト内のリンク切れ ${broken.size}種類（押すと404→トップに戻ってしまう）: ` + list([...broken.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}（${n}か所）`), 20));
    else ok('サイト内のリンク切れなし');
  }
}

// ================================================================== 結果
const out = [];
out.push(`✓ OK ${oks.length}項目`);
oks.forEach(m => out.push('  ✓ ' + m));
if (warns.length) { out.push(`⚠ 注意 ${warns.length}項目（公開は止めません）`); warns.forEach(m => out.push('  ⚠ ' + m)); }
if (errors.length) { out.push(`✗ エラー ${errors.length}項目 → 公開を中止します（いま公開中のサイトはそのまま）`); errors.forEach(m => out.push('  ✗ ' + m)); }
console.log(out.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 公開前チェック${PUB ? '（データ＋公開ページ）' : '（データ）'}：${errors.length ? '❌ 公開中止' : '✅ OK'}\n` +
    errors.map(m => `- ❌ ${m}\n`).join('') + warns.map(m => `- ⚠️ ${m}\n`).join('') + `- ✅ OK ${oks.length}項目\n\n`);
}
process.exit(errors.length ? 1 : 0);
