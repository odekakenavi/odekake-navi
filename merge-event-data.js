#!/usr/bin/env node
// イベント特集用のデータ（events / eventInfo）を、最新の spots.json に足すツール。
//   node tools/merge-event-data.js data/spots.json data/event-data.json
// ・spots.json の他の項目（施設の追加・修正など）には触らない。
// ・施設名が一致する施設の events / eventInfo だけを更新する（同じイベント名は上書き、他のイベントは残す）。
// ・施設名が見つからない場合は警告を出す（施設名を変えた時など）。
'use strict';
const fs = require('fs');
const [spotsPath, dataPath] = process.argv.slice(2);
if (!spotsPath || !dataPath) { console.error('使い方: node tools/merge-event-data.js data/spots.json data/event-data.json'); process.exit(1); }
const raw = fs.readFileSync(spotsPath, 'utf8');
const spots = JSON.parse(raw);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const byName = new Map(spots.map(s => [s.name, s]));
let updated = 0;
const missing = [];
for (const [name, d] of Object.entries(data)) {
  const s = byName.get(name);
  if (!s) { missing.push(name); continue; }
  s.events = Array.from(new Set([...(s.events || []), ...d.events]));
  s.eventInfo = Object.assign({}, s.eventInfo, d.eventInfo);
  updated++;
}
fs.writeFileSync(spotsPath, JSON.stringify(spots, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log(`更新した施設: ${updated}件`);
if (missing.length) console.warn('見つからなかった施設（名前を確認してください）:\n  ' + missing.join('\n  '));
