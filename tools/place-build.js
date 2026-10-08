#!/usr/bin/env node
/**
 * ページ生成ツールの出力（_build/ や _build_area/）を、リポジトリの正しい置き場所へ入れる。
 *   node tools/place-build.js _build            … 入れる（同名ファイルは上書き）
 *   node tools/place-build.js _build --dry      … 何も変更せず、入れ先だけ表示
 * 例：_build/chiba/… → site/area/chiba/…、_build/season/… → site/season/…、_build/sitemap.xml → site/root-files/sitemap.xml
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { repoDestForPublic } = require('./layout.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const src = args.find(a => !a.startsWith('--'));
if (!src) { console.error('使い方: node tools/place-build.js <ビルド出力フォルダ> [--dry]'); process.exit(1); }
const SRC = path.resolve(ROOT, src);
if (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) { console.error('✗ フォルダが見つかりません: ' + src); process.exit(1); }

let created = 0, overwritten = 0, skipped = 0;
const notes = [];
function copyTree(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { copyTree(a, b); continue; }
    const had = fs.existsSync(b);
    if (!DRY) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); }
    had ? overwritten++ : created++;
  }
}
for (const e of fs.readdirSync(SRC, { withFileTypes: true })) {
  const dest = repoDestForPublic(e.name, e.isDirectory());
  if (dest === null) { notes.push(`スキップ: ${e.name}（ビルドの成果物としては扱わないもの）`); skipped++; continue; }
  const from = path.join(SRC, e.name), to = path.join(ROOT, dest);
  if (e.isDirectory()) {
    if (dest.startsWith('site/area/') && !fs.existsSync(to)) notes.push(`新しいフォルダを site/area/ に作ります: ${e.name}（特集フォルダなら site/feature/ へ手動で移してください）`);
    copyTree(from, to);
  } else {
    const had = fs.existsSync(to);
    if (!DRY) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
    had ? overwritten++ : created++;
  }
  notes.push(`${e.name}${e.isDirectory() ? '/' : ''} → ${dest}${e.isDirectory() ? '/' : ''}`);
}
console.log(DRY ? '=== 予行演習（何も変更しません）===' : '=== 入れました ===');
notes.forEach(n => console.log('  ' + n));
console.log(`新規 ${created} / 上書き ${overwritten} / スキップ ${skipped}`);
