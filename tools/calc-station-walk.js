#!/usr/bin/env node
/**
 * tools/calc-station-walk.js  (v2)
 *
 * 施設の座標(lat/lng)と最寄駅を比べて、徒歩の「目安分数」を計算・点検します。
 * 外部パッケージ不要（Node.js 16以上）。
 *
 * ■ 駅データ（最初に1回だけ、リポジトリに置く）
 *   tools/data/stations.csv または tools/data/stations.geojson
 *   A) 国土数値情報「鉄道データ」の駅 GeoJSON（N02-xx_Station.geojson）
 *   B) CSV（1行目ヘッダー）。列名は自動判別:
 *        駅名: station_name / name / 駅名      緯度: lat / latitude / 緯度
 *        経度: lon / lng / longitude / 経度    路線: line / line_name / 路線名（任意）
 *        e_status 列があれば 0（運用中）だけ使います
 *   ※ 公開時点のデータです。最近できた駅は入っていないことがあります。
 *   ※ 国土数値情報の利用規約（出典の明記など）を確認してください。
 *
 * ■ よく使うコマンド
 *   施設を追加したあとの点検（何も書き換えない）:
 *     node tools/calc-station-walk.js --check
 *   新しい施設だけ計算して spots.json に書き込む（自動バックアップあり）:
 *     node tools/calc-station-walk.js --only-new --in-place
 *   全施設を計算し直して一覧CSVを出す（書き換えない）:
 *     node tools/calc-station-walk.js
 *
 * ■ オプション
 *   --stations=PATH   駅データ（既定: tools/data/stations.csv / .geojson）
 *   --spots=PATH      施設データ（既定: site/data/spots.json → なければ data/spots.json）
 *   --out=DIR         出力先（既定: tools/out）
 *   --detour=1.2      道なり補正（直線距離×この値。公式の徒歩分数253件との比較で1.2が最も合った）
 *   --speed=80        徒歩速度 m/分
 *   --max-dist=1200   直線距離がこれを超えたら「徒歩圏外」（分数は空欄）
 *   --check           点検だけ。新しい施設（walkMinutesEst が未設定）を一覧表示。何も書かない
 *   --strict          --check で問題があれば終了コード1（CIで止めたいとき用。通常は不要）
 *   --only-new        walkMinutesEst がまだない施設だけ対象にする
 *   --in-place        spots.json を直接更新（out/ に spots.json.bak-日時 を作る）
 *   --apply           spots.json は触らず、更新後のコピー(out/spots.walk-est.json)を出す
 *
 * ■ spots.json に書く項目
 *   stationEst        最寄駅名（目安）
 *   walkMinutesEst    徒歩の目安分数（公式の徒歩分数とは別物）。徒歩圏外は null（=計算済み・該当なし）
 *   walkMinutesManual 手で確認した分数。入れた施設はこのスクリプトが一切上書きしません
 *
 * ■ check 列の意味（accessの文章と座標のつき合わせ）
 *   OK       accessの駅名・徒歩分数と、座標からの計算がほぼ一致
 *   DIFF     徒歩分数が大きくずれている（座標のずれ・駅名違いの疑い）
 *   UNKNOWN  accessに徒歩分数があるが、駅名を駅データから特定できない
 *   FAR      accessに「徒歩圏／直結／すぐ」とあるのに、座標が駅から遠い（座標ミスの疑い）
 */

'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 引数 ----------
const opt = {
  stations: null, spots: null, out: 'tools/out',
  detour: 1.2, speed: 80, maxDist: 1200,
  apply: false, inPlace: false, onlyNew: false, check: false, strict: false,
};
const FLAGS = {
  '--apply': 'apply', '--in-place': 'inPlace', '--only-new': 'onlyNew',
  '--check': 'check', '--strict': 'strict',
};
for (const a of process.argv.slice(2)) {
  if (FLAGS[a]) { opt[FLAGS[a]] = true; continue; }
  const m = a.match(/^--([a-z-]+)=(.*)$/);
  if (!m) { console.error('不明な引数: ' + a); process.exit(1); }
  const key = m[1] === 'max-dist' ? 'maxDist' : m[1];
  if (!(key in opt) || typeof opt[key] === 'boolean') { console.error('不明なオプション: --' + m[1]); process.exit(1); }
  opt[key] = ['detour', 'speed', 'maxDist'].includes(key) ? Number(m[2]) : m[2];
}
if (!opt.stations) {
  opt.stations = ['tools/data/stations.csv', 'tools/data/stations.geojson', 'tools/data/stations.json']
    .find((p) => fs.existsSync(p)) || null;
}
if (!opt.stations) {
  console.error('駅データがありません。tools/data/stations.csv（または .geojson）を置くか、--stations=PATH を指定してください。冒頭の説明を参照。');
  process.exit(1);
}
if (!opt.spots) opt.spots = fs.existsSync('site/data/spots.json') ? 'site/data/spots.json' : 'data/spots.json';
for (const k of ['detour', 'speed', 'maxDist']) {
  if (!Number.isFinite(opt[k]) || opt[k] <= 0) { console.error(`--${k} は正の数にしてください`); process.exit(1); }
}
if (opt.check && (opt.inPlace || opt.apply)) {
  console.error('--check は点検専用です（--in-place / --apply とは併用できません）');
  process.exit(1);
}

// ---------- ユーティリティ ----------
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const cleanName = (n) => String(n).trim().replace(/駅$/, '');

// ---------- 駅データ読み込み ----------
function geomCoords(g) {
  if (!g) return [];
  switch (g.type) {
    case 'Point': return [g.coordinates];
    case 'LineString': return g.coordinates;
    case 'MultiLineString': return g.coordinates.flat();
    case 'Polygon': return g.coordinates[0] || [];
    case 'MultiPolygon': return g.coordinates.flat(2);
    default: return [];
  }
}

function fromGeoJSON(gj) {
  const out = [];
  for (const f of gj.features || []) {
    const p = f.properties || {};
    const name = p.N02_005 || p.station_name || p.name;
    const line = p.N02_003 || p.line || '';
    const pts = geomCoords(f.geometry);
    if (!name || !pts.length) continue;
    out.push({
      name: cleanName(name), line: String(line),
      lat: avg(pts.map((c) => c[1])), lng: avg(pts.map((c) => c[0])),
    });
  }
  return out;
}

function fromCSV(text) {
  const rows = parseCSV(text);
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  const find = (...names) => head.findIndex((h) => names.includes(h));
  const iName = find('station_name', 'name', '駅名');
  const iLat = find('lat', 'latitude', '緯度');
  const iLng = find('lon', 'lng', 'longitude', '経度');
  const iLine = find('line', 'line_name', '路線名');
  const iStatus = find('e_status');
  if (iName < 0 || iLat < 0 || iLng < 0) {
    throw new Error('CSVに 駅名・緯度・経度 の列が見つかりません（ヘッダー: ' + head.join(',') + '）');
  }
  const out = [];
  for (const r of rows) {
    if (iStatus >= 0 && r[iStatus] && r[iStatus].trim() !== '0') continue;
    const lat = parseFloat(r[iLat]);
    const lng = parseFloat(r[iLng]);
    if (!r[iName] || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ name: cleanName(r[iName]), line: iLine >= 0 ? (r[iLine] || '').trim() : '', lat, lng });
  }
  return out;
}

function loadStations(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const stations = /\.(geo)?json$/i.test(file) ? fromGeoJSON(JSON.parse(text)) : fromCSV(text);
  if (!stations.length) throw new Error('駅データを1件も読み込めませんでした: ' + file);
  return stations;
}

// ---------- accessの文章から駅名・徒歩分数を読む ----------
function officialWalkMin(access) {
  const m = String(access || '').match(/徒歩[^0-9０-９]{0,8}(\d+)(?:\s*[〜~～\-－ー]\s*(\d+))?\s*分/);
  if (!m) return null;
  return m[2] ? Math.round((Number(m[1]) + Number(m[2])) / 2) : Number(m[1]);
}

function accessCandidates(access) {
  const set = new Set();
  const t = String(access || '');
  for (const m of t.matchAll(/「([^」]{1,20})」/g)) set.add(m[1]);
  for (const m of t.matchAll(/([一-龥ぁ-んァ-ヶー・]{2,14})駅/g)) set.add(m[1]);
  return [...set];
}

// ---------- 準備 ----------
const stations = loadStations(opt.stations);
const spotsText = fs.readFileSync(opt.spots, 'utf8').replace(/^\uFEFF/, '');
const spots = JSON.parse(spotsText);
if (!Array.isArray(spots)) throw new Error('spots.json は配列形式を想定しています');

const byName = new Map();
for (const st of stations) {
  if (!byName.has(st.name)) byName.set(st.name, []);
  byName.get(st.name).push(st);
}
const stationNames = [...byName.keys()].sort((a, b) => b.length - a.length);
const resolveCache = new Map();
function resolveName(c) {
  if (resolveCache.has(c)) return resolveCache.get(c);
  const cc = cleanName(c);
  let r = byName.has(cc) ? cc : null;
  if (!r) r = stationNames.find((n) => n.length >= 3 && cc.endsWith(n)) || null; // 2文字駅名の末尾一致は誤検出しやすいので除外
  resolveCache.set(c, r);
  return r;
}
function nearestNamed(name, lat, lng) {
  let best = null;
  for (const st of byName.get(name)) {
    const d = haversine(lat, lng, st.lat, st.lng);
    if (!best || d < best.dist) best = { name, line: st.line, dist: d };
  }
  return best;
}

const estMin = (dist) => Math.max(1, Math.ceil((dist * opt.detour) / opt.speed));
const tolerance = (o) => Math.max(3, o * 0.5);

// ---------- 対象の選び方 ----------
//  ・walkMinutesManual がある施設は常に対象外（手入力を守る）
//  ・--only-new / --check のときは walkMinutesEst が未設定の施設だけ
function isTarget(s) {
  if (s.walkMinutesManual != null) return false;
  if ((opt.onlyNew || opt.check) && s.walkMinutesEst !== undefined) return false;
  return true;
}

// ---------- 計算 ----------
const results = [];
const noCoords = [];
let manualCount = 0;

for (const s of spots) {
  if (s.walkMinutesManual != null) manualCount++;
  if (!isTarget(s)) continue;
  const lat = Number(s.lat);
  const lng = Number(s.lng);
  const official = officialWalkMin(s.access);
  if (s.lat == null || s.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    noCoords.push(s);
    results.push({ s, status: 'no-coords', top: [], official, named: null, check: '' });
    continue;
  }

  // 駅名ごとに一番近いものだけ残して上位3駅
  const best = new Map();
  for (const st of stations) {
    if (Math.abs(st.lat - lat) > 0.05) continue; // 約5km以上は無視
    const d = haversine(lat, lng, st.lat, st.lng);
    const cur = best.get(st.name);
    if (!cur || d < cur.dist) best.set(st.name, { name: st.name, line: st.line, dist: d });
  }
  const top = [...best.values()].sort((a, b) => a.dist - b.dist).slice(0, 3);
  let status = 'ok';
  if (!top[0]) status = 'no-station';
  else if (top[0].dist > opt.maxDist) status = 'far';

  // accessに書かれた駅と座標のつき合わせ
  const named = accessCandidates(s.access)
    .map(resolveName).filter(Boolean)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .map((n) => nearestNamed(n, lat, lng))
    .map((x) => ({ ...x, est: estMin(x.dist) }));

  let check = '';
  if (official != null) {
    if (!named.length) check = 'UNKNOWN';
    else {
      const bestFit = named.reduce((a, b) => (Math.abs(a.est - official) <= Math.abs(b.est - official) ? a : b));
      check = Math.abs(bestFit.est - official) <= tolerance(official) ? 'OK' : 'DIFF';
    }
  } else if (named.length && /徒歩|直結|すぐ|隣接/.test(String(s.access || '')) && !/バス|タクシー|ゴンドラ|ロープウェイ|シャトル/.test(String(s.access || ''))) {
    const nearest = Math.min(...named.map((x) => x.dist));
    if (nearest > opt.maxDist) check = 'FAR';
  }
  results.push({ s, status, top, official, named, check });
}

const missing = results.filter((r) => r.status === 'ok');
const problems = results.filter((r) => ['DIFF', 'FAR', 'UNKNOWN'].includes(r.check));

// ---------- --check：点検だけして終了 ----------
if (opt.check) {
  console.log(`点検対象（walkMinutesEst 未設定）: ${results.length}件 / 全${spots.length}件`);
  if (!results.length) console.log('新しい施設はありません。');
  let shownNoCoords = 0;
  for (const r of results) {
    const t = r.top[0];
    if (r.status === 'no-coords') {
      if (shownNoCoords++ < 10) console.log(`  [座標なし] ${r.s.name}  ← 座標を入れると最寄駅を計算できます`);
      continue;
    }
    const near = t ? `${t.name} 約${Math.round(t.dist)}m / 目安${estMin(t.dist)}分` : '駅なし';
    const tag = r.status === 'far' ? '[徒歩圏外] ' : r.check && r.check !== 'OK' ? `[${r.check}] ` : '';
    console.log(`  ${tag}${r.s.name} | 最寄り: ${near}${r.official != null ? ` | 公式${r.official}分` : ''} | ${r.s.access || ''}`);
  }
  if (shownNoCoords > 10) console.log(`  …座標なしはほか${shownNoCoords - 10}件`);
  console.log(`\n計算できる: ${missing.length}件 / 要確認(DIFF・FAR・UNKNOWN): ${problems.length}件 / 座標なし: ${noCoords.length}件`);
  if (missing.length) console.log('→ node tools/calc-station-walk.js --only-new --in-place で書き込めます');
  if (opt.strict && (missing.length || problems.length || noCoords.length)) process.exit(1);
  process.exit(0);
}

// ---------- 出力 ----------
fs.mkdirSync(opt.out, { recursive: true });

const header = [
  'slug', 'name', 'status',
  'station1', 'line1', 'distance_m1', 'walk_min_est1',
  'station2', 'distance_m2', 'walk_min_est2',
  'station3', 'distance_m3', 'walk_min_est3',
  'official_walk_min', 'access_station', 'access_station_distance_m', 'access_station_walk_min_est', 'check', 'access',
];
const lines = [header.join(',')];
const jsonOut = {};

for (const r of results) {
  const t = r.top;
  const cols = (i) => (t[i] ? [t[i].name, Math.round(t[i].dist), estMin(t[i].dist)] : ['', '', '']);
  const [n1, d1, m1] = cols(0);
  const [n2, d2, m2] = cols(1);
  const [n3, d3, m3] = cols(2);
  const within = r.status === 'ok';
  const nm = r.named && r.named[0];
  lines.push([
    r.s.slug, r.s.name, r.status,
    n1, t[0] ? t[0].line : '', d1, within ? m1 : '',
    n2, d2, m2, n3, d3, m3,
    r.official ?? '', nm ? nm.name : '', nm ? Math.round(nm.dist) : '', nm ? nm.est : '', r.check || '', r.s.access || '',
  ].map(csvCell).join(','));

  if (within) {
    jsonOut[r.s.slug] = {
      station: t[0].name, line: t[0].line,
      distanceM: Math.round(t[0].dist), walkMinutesEst: m1,
      alt: t.slice(1).map((x) => ({ station: x.name, distanceM: Math.round(x.dist), walkMinutesEst: estMin(x.dist) })),
    };
  }
}
fs.writeFileSync(path.join(opt.out, 'station-walk.csv'), '\uFEFF' + lines.join('\n') + '\n');
fs.writeFileSync(path.join(opt.out, 'station-walk.json'), JSON.stringify(jsonOut, null, 1));

// ---------- spots.json への反映 ----------
function detectIndent(text) {
  const m = text.match(/^\[\s*\n([ \t]+)\S/);
  return m ? m[1] : null;
}
function updatedSpots() {
  let changed = 0;
  const resBySlug = new Map(results.map((r) => [r.s.slug, r]));
  const copy = spots.map((s) => {
    if (!isTarget(s)) return s;
    const j = jsonOut[s.slug];
    if (j) {
      if (s.stationEst === j.station && s.walkMinutesEst === j.walkMinutesEst) return s;
      changed++;
      return { ...s, stationEst: j.station, walkMinutesEst: j.walkMinutesEst };
    }
    const r = resBySlug.get(s.slug);
    if (r && (r.status === 'far' || r.status === 'no-station')) {
      // 徒歩圏外：計算済みの印として null を入れる（古い目安は消す）
      if (s.walkMinutesEst === null && s.stationEst === undefined) return s;
      changed++;
      const { stationEst, ...rest } = s;
      return { ...rest, walkMinutesEst: null };
    }
    // 座標なし：古い目安が残らないようにする（未計算のまま）
    if (s.stationEst != null || s.walkMinutesEst != null) {
      changed++;
      const { stationEst, walkMinutesEst, ...rest } = s;
      return rest;
    }
    return s;
  });
  return { copy, changed };
}
const stringify = (data) => JSON.stringify(data, null, detectIndent(spotsText) ?? undefined);

let wroteMsg = '';
if (opt.inPlace || opt.apply) {
  const { copy, changed } = updatedSpots();
  if (opt.inPlace) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const bak = path.join(opt.out, 'spots.json.bak-' + stamp);
    fs.writeFileSync(bak, spotsText);
    fs.writeFileSync(opt.spots, stringify(copy) + (spotsText.endsWith('\n') ? '\n' : ''));
    wroteMsg = `spots.json を更新しました（${changed}件変更）。バックアップ: ${bak}`;
  } else {
    const dst = path.join(opt.out, 'spots.walk-est.json');
    fs.writeFileSync(dst, stringify(copy) + '\n');
    wroteMsg = `コピーを出力しました（${changed}件変更）: ${dst}`;
  }
}

// ---------- サマリー ----------
const count = (f) => results.filter(f).length;
console.log('駅データ     : ' + stations.length + '件');
console.log('施設         : ' + spots.length + '件（今回の対象 ' + results.length + '件 / 手入力で保護 ' + manualCount + '件）');
console.log('  徒歩圏内(' + opt.maxDist + 'm以内) : ' + count((r) => r.status === 'ok'));
console.log('  徒歩圏外     : ' + count((r) => r.status === 'far' || r.status === 'no-station'));
console.log('  座標なし     : ' + noCoords.length);
console.log('accessとの比較: OK ' + count((r) => r.check === 'OK') + ' / DIFF ' + count((r) => r.check === 'DIFF') +
  ' / FAR ' + count((r) => r.check === 'FAR') + ' / UNKNOWN ' + count((r) => r.check === 'UNKNOWN'));
const shown = problems.filter((r) => r.check !== 'UNKNOWN').slice(0, 10);
if (shown.length) {
  console.log('\n要確認の例（先頭10件。座標・駅名の見直し候補）:');
  for (const r of shown) {
    const nm = r.named && r.named[0];
    console.log(`  [${r.check}] ${r.s.name} | 公式 ${r.official ?? '-'}分 | 計算 ${nm ? nm.name + ' ' + nm.est + '分' : '-'} | ${r.s.access}`);
  }
}
if (wroteMsg) console.log('\n' + wroteMsg);
console.log('出力: ' + path.resolve(opt.out));
