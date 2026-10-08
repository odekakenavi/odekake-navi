#!/usr/bin/env node
/**
 * おでかけナビ：公開ファイルを site/ フォルダへまとめるスクリプト
 *
 * 使い方（リポジトリ直下で実行。Node.js と Git が入っていればWindows/Macどちらでも動きます）:
 *   node move-to-site.js          ← 予行演習。何も変更せず、やる内容だけ表示
 *   node move-to-site.js --run    ← 実際に移動し、.github/workflows/pages.yml も作る
 *
 * やること:
 *   ・ルートにある「公開ページ」（都道府県フォルダ、index.html、data、画像、sitemap.xml など）を site/ へ移す
 *     （git mv を使うので履歴が残り、git でいつでも戻せます）
 *   ・公開URLは変わりません（GitHub Pages の公開元を site/ に切り替えるため）
 *   ・GitHub Actions で site/ を公開する設定ファイルを作る
 *
 * 動かさないもの: tools/ backend/ docs/ .github/ README.md LICENSE .gitignore など（下の STAY）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RUN = process.argv.includes('--run');
const FORCE = process.argv.includes('--force');     // 未コミットの変更があっても進める（非推奨）
const ROOT = process.cwd();
const SITE = 'site';

// ルートに残すもの
const STAY = new Set([
  '.git', '.github', '.gitignore', '.gitattributes', '.vscode',
  'tools', 'backend', 'docs', 'node_modules', SITE,
  'README.md', 'LICENSE', 'package.json', 'package-lock.json',
  'move-to-site.js',
]);
const STAY_PATTERNS = [/^_build/];                    // ビルドの出力フォルダ（_build_area など）は公開しない
// 公開しないが残したいファイルの移動先
const TO_DOCS = new Map([['_template.json', 'docs/experiences-template.json']]);

const WORKFLOW = `name: Deploy site to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${SITE}
      - id: deployment
        uses: actions/deploy-pages@v4
`;

function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function die(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1); }

// ---- 事前チェック
if (!fs.existsSync(path.join(ROOT, '.git'))) die('ここはGitリポジトリの直下ではありません（.git が見つかりません）。リポジトリのフォルダを開いてから実行してください。');
if (!fs.existsSync(path.join(ROOT, 'index.html'))) die('index.html が見つかりません。リポジトリ直下で実行してください。');
if (fs.existsSync(path.join(ROOT, SITE))) die(`${SITE}/ が既にあります。二重に実行しないでください。`);
try { git(['--version']); } catch (e) { die('git が使えません。Git をインストールしてください。'); }
const dirty = git(['status', '--porcelain', '--untracked-files=no']).trim();   // 追跡中のファイルの未コミット変更だけを確認
if (dirty && !FORCE) die('未コミットの変更があります。先にコミットするか、git stash で退避してから実行してください。\n' + dirty.split('\n').slice(0, 10).join('\n'));
const untracked = git(['ls-files', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean);

// ---- 移動対象を決める
const entries = fs.readdirSync(ROOT).sort();
const toSite = [], toDocs = [], stay = [];
for (const name of entries) {
  if (TO_DOCS.has(name)) { toDocs.push(name); continue; }
  if (STAY.has(name) || STAY_PATTERNS.some(re => re.test(name))) { stay.push(name); continue; }
  toSite.push(name);
}

console.log(RUN ? '=== 実行モード ===' : '=== 予行演習（何も変更しません。--run で実行）===');
console.log(`\nルートに残す（${stay.length}）: ${stay.join('  ')}`);
console.log(`\ndocs/ へ移す（${toDocs.length}）:`);
for (const n of toDocs) console.log(`  ${n} → ${TO_DOCS.get(n)}`);
console.log(`\n${SITE}/ へ移す（${toSite.length}）:`);
for (const n of toSite) {
  const isDir = fs.statSync(path.join(ROOT, n)).isDirectory();
  console.log(`  ${n}${isDir ? '/' : ''}`);
}

// 公開に必須のものが移動対象に入っているか確認
const MUST = ['index.html', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml', 'robots.txt'];
const missing = MUST.filter(n => !toSite.includes(n));
if (missing.length) console.log(`\n⚠ 次のファイルがルートに見つかりません（元から無いなら問題ありません）: ${missing.join(', ')}`);
if (!toSite.includes('data')) console.log('\n⚠ data/ フォルダが見つかりません。index.html は data/spots.json を読むので、確認してください。');

const untrackedTop = [...new Set(untracked.map(f => f.split('/')[0]))].filter(n => toSite.includes(n));
if (untrackedTop.length) console.log(`\n⚠ Gitにまだ登録されていない（未追跡の）ものが公開側に入ります: ${untrackedTop.join(', ')}\n  公開したくないものなら、先に削除するか .gitignore に書いてください。`);

if (!RUN) { console.log('\n（予行演習のため、ここで終了）'); process.exit(0); }

// ---- 実行
function move(src, dst) {
  fs.mkdirSync(path.dirname(path.join(ROOT, dst)), { recursive: true });
  try { git(['mv', '--', src, dst]); }
  catch (e) { fs.renameSync(path.join(ROOT, src), path.join(ROOT, dst)); }   // 未追跡のものは普通に移動
}
fs.mkdirSync(path.join(ROOT, SITE), { recursive: true });
for (const n of toDocs) move(n, TO_DOCS.get(n));
for (const n of toSite) { process.stdout.write(`  移動 ${n} … `); move(n, `${SITE}/${n}`); console.log('OK'); }

const wf = path.join(ROOT, '.github', 'workflows', 'pages.yml');
fs.mkdirSync(path.dirname(wf), { recursive: true });
fs.writeFileSync(wf, WORKFLOW);
console.log('\n  作成 .github/workflows/pages.yml');

// 移動後の確認
const check = ['index.html', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml', 'data/spots.json', 'data/hotels.json'];
console.log('\n--- 移動後の確認 ---');
for (const f of check) console.log(`  ${fs.existsSync(path.join(ROOT, SITE, f)) ? '✓' : '✗'} ${SITE}/${f}`);

console.log(`
=== 次にやること ===
  1) git status で、移動（renamed）と pages.yml の追加だけになっているか確認
  2) 【先に】GitHub の Settings → Pages → Source を「GitHub Actions」に変更（今のサイトは消えずに残ります）
  3) git add -A && git commit -m "公開ファイルを site/ にまとめる" && git push
  4) GitHub の Actions タブで緑のチェックが付くのを待ち、サイトが今まで通り表示されるか確認
  5) うまくいかない時: git revert HEAD してプッシュ → Settings → Pages を元の「Deploy from a branch」に戻す
`);
