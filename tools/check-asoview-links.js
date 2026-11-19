#!/usr/bin/env node
/**
 * check-asoview-links.js
 * アソビュー!のチケット直通URLが切れていないかを確認する（PCで実行・月1回ほど）
 *
 * 使い方（リポジトリのルートで実行）:
 *   node tools/check-asoview-links.js                       # 既定のspots.jsonを確認
 *   node tools/check-asoview-links.js site/data/spots.json  # パスを指定
 *   node tools/check-asoview-links.js --write               # OKだった直通URLに確認日を記録
 *   node tools/check-asoview-links.js --all                 # base/spot形式も含めて全部確認
 *
 * 確認する対象（既定）:
 *   1. bookingLinks.asoviewTicket（チケット直通URL）
 *   2. bookingLinks.asoview のうち ticket / item / plan / channel 形式のURL
 *
 * 結果:
 *   OK       … 200で表示でき、販売終了などの文言もなし
 *   要確認   … 別ページへ飛ばされた／販売終了らしい文言あり（ブラウザで開いて確認）
 *   NG       … 404などで開けない（asoviewTicketを削除→baseに戻す、またはURL差し替え）
 *   確認不可 … 403・通信エラーなど（ボット対策の可能性。ブラウザで確認）
 *
 * 結果は asoview-link-check.csv にも保存します。
 * --write は、asoviewTicket を持つ施設のうち OK だったものだけに
 * asoviewTicketCheckedAt（YYYY-MM-DD）を書き込みます。NGは自動で消しません。
 * Node.js 18以上が必要です。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const fileArg = args.find(a => !a.startsWith('--'));
const WRITE = flags.has('--write');
const ALL = flags.has('--all');

const DEFAULT_PATHS = ['site/data/spots.json', 'data/spots.json', 'spots.json'];
const SPOTS_PATH = fileArg || DEFAULT_PATHS.find(p => fs.existsSync(p));
if (!SPOTS_PATH || !fs.existsSync(SPOTS_PATH)) {
  console.error('spots.json が見つかりません。パスを指定してください。');
  console.error('例: node tools/check-asoview-links.js site/data/spots.json');
  process.exit(1);
}
if (typeof fetch !== 'function') {
  console.error('Node.js 18以上が必要です（fetchが使えません）。');
  process.exit(1);
}

const TIMEOUT_MS = 20000;
const WAIT_MS = 1500; // 相手サーバーに負荷をかけないための間隔
const UA = 'Mozilla/5.0 (compatible; odekake-navi-linkcheck/1.0; +https://odekakenavi.github.io/odekake-navi/)';
const DEAD_WORDS = [
  'ページが見つかりません',
  'お探しのページは見つかりません',
  '販売を終了',
  '販売は終了',
  '受付を終了',
  '受付は終了',
  '掲載を終了',
  '公開を終了',
  '現在ご利用いただけません',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isDirectForm = u => /asoview\.com\/(?:item\/|ticket\/|plan\/|channel\/)/i.test(u);

function collectTargets(spots) {
  const list = [];
  for (const s of spots) {
    const b = s.bookingLinks;
    if (!b) continue;
    if (b.asoviewTicket) list.push({ name: s.name, field: 'asoviewTicket', url: b.asoviewTicket });
    if (b.asoview && (ALL || isDirectForm(b.asoview))) {
      list.push({ name: s.name, field: 'asoview', url: b.asoview });
    }
  }
  return list;
}

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' },
    });
    const finalUrl = res.url || url;
    const status = res.status;
    if (status === 404 || status === 410) return { result: 'NG', detail: `HTTP ${status}`, finalUrl };
    if (status >= 400) return { result: '確認不可', detail: `HTTP ${status}（ボット対策の可能性）`, finalUrl };

    let body = '';
    try { body = (await res.text()).slice(0, 400000); } catch (_) { /* 本文が読めなくても続行 */ }

    // 別ページへ飛ばされていないか
    try {
      const a = new URL(url);
      const b = new URL(finalUrl);
      if (a.pathname.replace(/\/+$/, '') !== b.pathname.replace(/\/+$/, '')) {
        return { result: '要確認', detail: `別のページへ移動: ${b.pathname}`, finalUrl };
      }
    } catch (_) { /* URL解析に失敗したら次の判定へ */ }

    const hit = DEAD_WORDS.find(w => body.includes(w));
    if (hit) return { result: '要確認', detail: `ページ内に「${hit}」`, finalUrl };
    return { result: 'OK', detail: `HTTP ${status}`, finalUrl };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'タイムアウト' : (e && e.message) || String(e);
    return { result: '確認不可', detail: msg, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

(async () => {
  const raw = fs.readFileSync(SPOTS_PATH, 'utf8');
  const spots = JSON.parse(raw);
  const targets = collectTargets(spots);
  console.log(`対象: ${targets.length}件（${SPOTS_PATH}${ALL ? '、--all' : ''}）`);
  if (targets.length === 0) {
    console.log('確認するURLがありません。');
    return;
  }

  const rows = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const r = await check(t.url);
    rows.push({ ...t, ...r });
    console.log(`[${i + 1}/${targets.length}] ${r.result.padEnd(4, '　')} ${t.name}（${t.field}） ${r.detail}`);
    if (i < targets.length - 1) await sleep(WAIT_MS);
  }

  const count = k => rows.filter(r => r.result === k).length;
  console.log('\n--- 結果 ---');
  console.log(`OK ${count('OK')} / 要確認 ${count('要確認')} / NG ${count('NG')} / 確認不可 ${count('確認不可')}`);
  const bad = rows.filter(r => r.result !== 'OK');
  if (bad.length) {
    console.log('\n確認が必要なもの:');
    bad.forEach(r => console.log(`  [${r.result}] ${r.name}（${r.field}）\n    ${r.url}\n    ${r.detail}`));
  }

  const csv = ['施設名,項目,結果,詳細,URL']
    .concat(rows.map(r => [r.name, r.field, r.result, r.detail, r.url].map(csvCell).join(',')))
    .join('\n');
  fs.writeFileSync('asoview-link-check.csv', '\uFEFF' + csv, 'utf8');
  console.log('\nasoview-link-check.csv に保存しました。');

  if (WRITE) {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 日本時間
    const okNames = new Set(rows.filter(r => r.field === 'asoviewTicket' && r.result === 'OK').map(r => r.name));
    let n = 0;
    for (const s of spots) {
      if (s.bookingLinks && s.bookingLinks.asoviewTicket && okNames.has(s.name)) {
        s.asoviewTicketCheckedAt = today;
        n++;
      }
    }
    // spots.json は1行（改行なし）の形式なので、同じ形式で書き戻す
    const out = path.resolve(SPOTS_PATH);
    fs.writeFileSync(out, JSON.stringify(spots), 'utf8');
    console.log(`確認日（${today}）を ${n}件に書き込みました: ${out}`);
  } else {
    console.log('（確認日を記録するには --write を付けて実行してください）');
  }
})();
