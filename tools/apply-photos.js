#!/usr/bin/env node
/**
 * 選んだ写真を取り込むツール
 *
 * 使い方（リポジトリのルートで、Node.js 18以上）:
 *   node tools/apply-photos.js --spots site/data/spots.json --choices photo-work/photo-choices.json
 *   node tools/apply-photos.js --dry        # 書き込まずに確認だけ
 *   --imgdir ほかの/フォルダ   # 写真の保存先を変える（既定は photo/spots。spots.jsonに書くパスも同じになります）
 *   --prefix photo/spots   # spots.jsonに書くパスだけ別にしたいとき
 *
 * 写真を photo/spots/<slugの/を-に置換>.jpg(png) に保存し、spots.json に
 * image / imageCredit / imageSourceUrl を書き込みます（元の spots.json は .bak に退避）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const UA = 'odekakenavi-photo-finder/1.0 (https://odekakenavi.github.io/odekake-navi/; personal project)';
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return o;
}
const args = parseArgs(process.argv.slice(2));
const SPOTS = args.spots || (fs.existsSync('index.html') ? ['data/spots.json', 'site/data/spots.json'] : ['site/data/spots.json', 'data/spots.json']).find(p => fs.existsSync(p));
const WORK = args.work || 'photo-work';
const CHOICES = args.choices || path.join(WORK, 'photo-choices.json');
const CANDS = args.cands || path.join(WORK, 'candidates.json');
const IMGDIR = args.imgdir || 'photo/spots'; // 写真の保存先（既定: リポジトリ直下の photo/spots）
const IMG_PREFIX = (args.prefix ? String(args.prefix) : IMGDIR.replace(/^\.?\/?site\//, '')).replace(/\/+$/, '') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function creditText(c) {
  const lic = c.license || '';
  const isPd = /^(CC0|Public domain|PD)/i.test(lic);
  const artist = (c.artist || '').replace(/^Own work\s*/i, '').trim();
  const parts = ['📷'];
  if (artist && !/^(unknown|不明)/i.test(artist)) parts.push(artist);
  parts.push(isPd ? 'パブリックドメイン' : lic);
  parts.push('Wikimedia Commons');
  return escHtml(parts.join(' / ').replace('📷 /', '📷'));
}


// ---- candidates.json が無いとき（フォルダを作り直した場合など）は、選んだファイル名からCommonsに直接問い合わせる ----
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const stripTags = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const LICENSE_OK = /^(CC0|Public domain|PD[ -]|CC BY(-SA)? [1-4]\.\d)/i;
const LICENSE_NG = /(NC|ND|GFDL only|fair use)/i;

async function lookupFiles(titles) {
  const found = {};
  for (let i = 0; i < titles.length; i += 20) {
    const part = titles.slice(i, i + 20);
    const url = COMMONS + '?' + new URLSearchParams({
      format: 'json', formatversion: '2', action: 'query', titles: part.join('|'),
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '800',
      iiextmetadatalanguage: 'ja', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist'
    });
    let json = null;
    for (let t = 0; t < 4 && !json; t++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (t + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      json = await res.json();
    }
    for (const p of (json && json.query && json.query.pages) || []) {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii) continue;
      const md = ii.extmetadata || {};
      const lic = stripTags(md.LicenseShortName && md.LicenseShortName.value);
      if (!LICENSE_OK.test(lic) || LICENSE_NG.test(lic)) continue; // 自由なライセンスだけ
      found[p.title] = {
        fileTitle: p.title, mime: ii.mime, license: lic,
        artist: stripTags(md.Artist && md.Artist.value).slice(0, 80),
        thumbUrl: ii.thumburl || ii.url,
        pageUrl: ii.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')))
      };
    }
    await sleep(300);
  }
  return found;
}

async function download(url, dest) {
  for (let t = 0; t < 4; t++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (t + 1)); continue; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error('画像が小さすぎます（' + buf.length + 'B）');
    fs.writeFileSync(dest, buf);
    return buf.length;
  }
  throw new Error('ダウンロードに失敗しました');
}

async function main() {
  for (const f of [SPOTS, CHOICES]) {
    if (!f || !fs.existsSync(f)) { console.error('見つかりません: ' + f); process.exit(1); }
  }
  console.log('spots.json        : ' + SPOTS);
  console.log('写真の保存先      : ' + IMGDIR);
  console.log('spots.jsonに書く値: ' + IMG_PREFIX + '（ファイル名）');
  const spots = JSON.parse(fs.readFileSync(SPOTS, 'utf8'));
  const choices = JSON.parse(fs.readFileSync(CHOICES, 'utf8'));
  const cands = fs.existsSync(CANDS) ? JSON.parse(fs.readFileSync(CANDS, 'utf8')).results : {};
  const missing = choices.filter(ch => !(cands[ch.slug] && cands[ch.slug].candidates.some(c => c.fileTitle === ch.fileTitle)));
  let looked = {};
  if (missing.length) {
    console.log('candidates.json に無い写真 ' + missing.length + ' 件を、Commonsに直接問い合わせます…');
    looked = await lookupFiles([...new Set(missing.map(m => m.fileTitle))]);
  }
  const bySlug = new Map(spots.map(s => [s.slug, s]));
  if (!args.dry) fs.mkdirSync(IMGDIR, { recursive: true });

  let ok = 0, ng = 0;
  for (const ch of choices) {
    const spot = bySlug.get(ch.slug);
    const cand = (cands[ch.slug] && cands[ch.slug].candidates.find(c => c.fileTitle === ch.fileTitle)) || looked[ch.fileTitle];
    if (!spot || !cand) { console.warn('スキップ（写真が見つからない／ライセンス不可）: ' + ch.slug + ' ' + ch.fileTitle); ng++; continue; }
    const ext = cand.mime === 'image/png' ? 'png' : 'jpg';
    const file = `${ch.slug.replace(/[\/\\]+/g, '-')}.${ext}`;
    try {
      if (args.dry) {
        console.log(`[dry] ${spot.name} <- ${cand.fileTitle} (${cand.license})`);
      } else {
        const size = await download(cand.thumbUrl, path.join(IMGDIR, file));
        spot.image = IMG_PREFIX + file;
        spot.imageCredit = creditText(cand);
        spot.imageSourceUrl = cand.pageUrl;
        console.log(`OK ${spot.name} (${Math.round(size / 1024)}KB)`);
        await sleep(400);
      }
      ok++;
    } catch (e) {
      console.warn(`NG ${spot.name}: ${e.message}`);
      ng++;
    }
  }
  if (!args.dry && ok) {
    fs.copyFileSync(SPOTS, SPOTS + '.bak');
    fs.writeFileSync(SPOTS, JSON.stringify(spots, null, 2));
  }
  console.log(`\n完了: 成功 ${ok} / 失敗 ${ng}`);
  if (!args.dry && ok) console.log('次: 静的ページ・sitemapの再生成（tools/refresh-static-pages.js）を実行し、' + IMGDIR + ' と spots.json をGitHubへ。');
}
main().catch(e => { console.error(e); process.exit(1); });
