#!/usr/bin/env node
/**
 * おでかけナビ：リポジトリの置き場所を整理する（一回きりの移行スクリプト）
 *
 * 使い方（リポジトリ直下で実行）:
 *   node migrate-layout.js          ← 予行演習。何も変更せず、移す内容だけ表示
 *   node migrate-layout.js --run    ← 実際に移す。移したあと、公開用フォルダを組み立てて「今の公開内容と1バイトも違わないか」を自動で照合する
 *
 * 移したあとの形:
 *   index.html / data/ / photo/（公開時は /img/）
 *   site/area/（都道府県）  site/event/  site/season/  site/feature/（purpose, free, rainy-day）  site/root-files/（ルート固定のファイル）
 *   公開URLは1つも変わりません。公開は GitHub Actions が tools/build-public.js で自動的に組み立てます。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const RUN = process.argv.includes('--run');
const ROOT = process.cwd();
const FEATURES = ['purpose', 'free', 'rainy-day', 'baby'];
const FILES = {
 "tools/layout.js": "'use strict';\n/**\n * おでかけナビ：リポジトリの置き場所 ⇔ 公開URL の対応表\n *\n *   リポジトリ内                         公開されるURL\n *   index.html                       →  /index.html\n *   data/                            →  /data/\n *   photo/                           →  /img/\n *   site/area/<都道府県>/             →  /<都道府県>/        （例：site/area/chiba → /chiba/）\n *   site/feature/<特集>/              →  /<特集>/            （purpose, free, rainy-day, baby）\n *   site/event/                      →  /event/\n *   site/season/                     →  /season/\n *   site/root-files/<ファイル>        →  /<ファイル>         （service-worker.js, sitemap.xml など、ルート固定のもの）\n *\n * 新しい都道府県フォルダは site/area/ に、新しい特集フォルダは site/feature/ に入れるだけで、公開時に自動で最上位へ出ます。\n */\nconst FEATURES = ['purpose', 'free', 'rainy-day', 'baby'];\n\n// 公開URLの最上位の名前（ファイル or フォルダ）から、リポジトリ内の置き場所を返す。null なら「ビルドの成果物としては扱わない」\nfunction repoDestForPublic(name, isDir) {\n  if (!isDir) return name === 'index.html' ? null : 'site/root-files/' + name;\n  if (name === 'event' || name === 'season') return 'site/' + name;\n  if (name === 'data' || name === 'img') return null;\n  if (FEATURES.includes(name)) return 'site/feature/' + name;\n  return 'site/area/' + name;\n}\nmodule.exports = { FEATURES, repoDestForPublic };\n",
 "tools/build-public.js": "#!/usr/bin/env node\n/**\n * 公開用フォルダ（_public/）を、リポジトリの置き場所（tools/layout.js の対応表）から組み立てる。\n *   node tools/build-public.js              … _public/ に作る\n *   node tools/build-public.js --out 場所    … 出力先を変える\n * GitHub Actions が公開の直前に自動で実行します（.github/workflows/pages.yml）。手元で確認したい時にも使えます。\n * 同じURLに2つのファイルが重なる場合や、対応表に無いフォルダがある場合、必須ファイルが無い場合は、エラーで止まります（＝公開されません）。\n */\n'use strict';\nconst fs = require('fs');\nconst path = require('path');\nconst { FEATURES } = require('./layout.js');\n\nconst ROOT = path.resolve(__dirname, '..');\nconst argv = process.argv.slice(2);\nconst OUT = path.resolve(ROOT, (i => (i >= 0 && argv[i + 1]) ? argv[i + 1] : '_public')(argv.indexOf('--out')));\nconst REQUIRED = ['index.html', 'data/spots.json', 'data/hotels.json', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml', 'robots.txt', '404.html'];\nconst errors = [];\nlet files = 0;\n\nfunction exists(p) { return fs.existsSync(p); }\nfunction put(srcAbs, publicRel) {\n  const dst = path.join(OUT, publicRel);\n  if (exists(dst)) { errors.push(`公開URLが重なっています: /${publicRel}（${path.relative(ROOT, srcAbs)}）`); return; }\n  fs.mkdirSync(path.dirname(dst), { recursive: true });\n  fs.cpSync(srcAbs, dst, { recursive: true, errorOnExist: true, force: false });\n}\n\nif (OUT === ROOT || OUT === path.join(ROOT, 'site')) { console.error('✗ 出力先が危険な場所です: ' + OUT); process.exit(1); }\nfs.rmSync(OUT, { recursive: true, force: true });\nfs.mkdirSync(OUT, { recursive: true });\n\n// 1) ルートの index.html / data / photo\nif (exists(path.join(ROOT, 'index.html'))) put(path.join(ROOT, 'index.html'), 'index.html'); else errors.push('index.html がルートにありません');\nif (exists(path.join(ROOT, 'data'))) put(path.join(ROOT, 'data'), 'data');\nif (exists(path.join(ROOT, 'photo'))) put(path.join(ROOT, 'photo'), 'img');\n\n// 2) site/ の中\nconst SITE = path.join(ROOT, 'site');\nif (!exists(SITE)) errors.push('site/ フォルダがありません');\nelse for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {\n  const abs = path.join(SITE, e.name);\n  if (e.isDirectory() && (e.name === 'area' || e.name === 'feature' || e.name === 'root-files')) {\n    for (const c of fs.readdirSync(abs, { withFileTypes: true })) {\n      if (e.name === 'feature' && !c.isDirectory()) { errors.push(`site/feature/ にはフォルダだけを置いてください: ${c.name}`); continue; }\n      if (e.name === 'area' && !c.isDirectory()) { errors.push(`site/area/ にはフォルダだけを置いてください: ${c.name}`); continue; }\n      put(path.join(abs, c.name), c.name);\n    }\n  } else if (e.isDirectory() && (e.name === 'event' || e.name === 'season')) {\n    put(abs, e.name);\n  } else {\n    errors.push(`site/${e.name} の置き場所が決まっていません（area / feature / event / season / root-files のどれかに入れてください）`);\n  }\n}\n\n// 3) 必須ファイルの確認\nfor (const r of REQUIRED) if (!exists(path.join(OUT, r))) errors.push(`必須ファイルがありません: /${r}`);\n\n// 4) 件数\n(function count(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : files++; })(OUT);\n\nif (errors.length) { console.error('✗ 公開用フォルダを作れませんでした:\\n  ' + errors.join('\\n  ')); process.exit(1); }\nconsole.log(`✓ ${path.relative(ROOT, OUT) || OUT}/ に ${files} ファイルを組み立てました`);\n",
 "tools/place-build.js": "#!/usr/bin/env node\n/**\n * ページ生成ツールの出力（_build/ や _build_area/）を、リポジトリの正しい置き場所へ入れる。\n *   node tools/place-build.js _build            … 入れる（同名ファイルは上書き）\n *   node tools/place-build.js _build --dry      … 何も変更せず、入れ先だけ表示\n * 例：_build/chiba/… → site/area/chiba/…、_build/season/… → site/season/…、_build/sitemap.xml → site/root-files/sitemap.xml\n */\n'use strict';\nconst fs = require('fs');\nconst path = require('path');\nconst { repoDestForPublic } = require('./layout.js');\n\nconst ROOT = path.resolve(__dirname, '..');\nconst args = process.argv.slice(2);\nconst DRY = args.includes('--dry');\nconst src = args.find(a => !a.startsWith('--'));\nif (!src) { console.error('使い方: node tools/place-build.js <ビルド出力フォルダ> [--dry]'); process.exit(1); }\nconst SRC = path.resolve(ROOT, src);\nif (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) { console.error('✗ フォルダが見つかりません: ' + src); process.exit(1); }\n\nlet created = 0, overwritten = 0, skipped = 0;\nconst notes = [];\nfunction copyTree(from, to) {\n  for (const e of fs.readdirSync(from, { withFileTypes: true })) {\n    const a = path.join(from, e.name), b = path.join(to, e.name);\n    if (e.isDirectory()) { copyTree(a, b); continue; }\n    const had = fs.existsSync(b);\n    if (!DRY) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); }\n    had ? overwritten++ : created++;\n  }\n}\nfor (const e of fs.readdirSync(SRC, { withFileTypes: true })) {\n  const dest = repoDestForPublic(e.name, e.isDirectory());\n  if (dest === null) { notes.push(`スキップ: ${e.name}（ビルドの成果物としては扱わないもの）`); skipped++; continue; }\n  const from = path.join(SRC, e.name), to = path.join(ROOT, dest);\n  if (e.isDirectory()) {\n    if (dest.startsWith('site/area/') && !fs.existsSync(to)) notes.push(`新しいフォルダを site/area/ に作ります: ${e.name}（特集フォルダなら site/feature/ へ手動で移してください）`);\n    copyTree(from, to);\n  } else {\n    const had = fs.existsSync(to);\n    if (!DRY) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }\n    had ? overwritten++ : created++;\n  }\n  notes.push(`${e.name}${e.isDirectory() ? '/' : ''} → ${dest}${e.isDirectory() ? '/' : ''}`);\n}\nconsole.log(DRY ? '=== 予行演習（何も変更しません）===' : '=== 入れました ===');\nnotes.forEach(n => console.log('  ' + n));\nconsole.log(`新規 ${created} / 上書き ${overwritten} / スキップ ${skipped}`);\n",
 ".github/workflows/pages.yml": "name: Deploy site to GitHub Pages\n\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\n\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\nconcurrency:\n  group: pages\n  cancel-in-progress: false\n\njobs:\n  deploy:\n    environment:\n      name: github-pages\n      url: ${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      # リポジトリの置き場所（site/area など）から、公開用の形（_public/）を組み立てる。重なり・不足があればここで止まり、公開されない。\n      - name: Assemble public site\n        run: node tools/build-public.js --out _public\n      - uses: actions/configure-pages@v5\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: _public\n      - id: deployment\n        uses: actions/deploy-pages@v4\n"
};   // tools/layout.js などの中身（このスクリプトが書き出す）

const p = (...a) => path.join(ROOT, ...a);
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const die = m => { console.error('\n✗ ' + m + '\n'); process.exit(1); };

// ---- 事前チェック
if (!fs.existsSync(p('.git'))) die('Gitリポジトリの直下で実行してください（.git が見つかりません）。');
if (!fs.existsSync(p('site', 'index.html'))) die('site/index.html が見つかりません。今の形（公開ファイルが site/ にまとまっている状態）で実行してください。');
if (fs.existsSync(p('index.html'))) die('ルートに index.html が既にあります。二重に実行しないでください。');
if (fs.existsSync(p('site', 'area'))) die('site/area/ が既にあります。二重に実行しないでください。');
const dirty = git(['status', '--porcelain', '--untracked-files=no']).split('\n').filter(l => l.trim() && !/migrate-layout\.js$/.test(l)).join('\n').trim();
if (dirty) die('未コミットの変更があります。先にコミットしてから実行してください。\n' + dirty.split('\n').slice(0, 10).join('\n'));

// ---- 現在の公開内容（site/ の全ファイル）の指紋を取る
function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    e.isDirectory() ? walk(path.join(dir, e.name), r, out) : out.push(r);
  }
  return out;
}
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const before = new Map(walk(p('site')).map(r => [r, sha(p('site', r))]));

// ---- 移動計画
const plan = [];   // [from, to]
const notes = [];
for (const e of fs.readdirSync(p('site'), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  const n = e.name, from = 'site/' + n;
  if (!e.isDirectory()) { plan.push([from, n === 'index.html' ? 'index.html' : 'site/root-files/' + n]); continue; }
  if (n === 'data') plan.push([from, 'data']);
  else if (n === 'img') plan.push([from, 'photo']);
  else if (n === 'event' || n === 'season') continue;                       // そのまま
  else if (FEATURES.includes(n)) plan.push([from, 'site/feature/' + n]);
  else { plan.push([from, 'site/area/' + n]); }
}
console.log(RUN ? '=== 実行モード ===' : '=== 予行演習（何も変更しません。--run で実行）===');
console.log(`\n現在の公開内容: ${before.size} ファイル\n\n移動（${plan.length}）:`);
for (const [f, t] of plan) console.log(`  ${f}${fs.statSync(p(f)).isDirectory() ? '/' : ''}  →  ${t}${fs.statSync(p(f)).isDirectory() ? '/' : ''}`);
console.log('  （site/event/ と site/season/ はそのまま）');
console.log('\n書き出すファイル: ' + Object.keys(FILES).join('  ') + '  .gitignore（追記）');
for (const [, t] of plan) if (fs.existsSync(p(t))) die(`移動先が既にあります: ${t}`);
const areaDirs = plan.filter(([, t]) => t.startsWith('site/area/')).map(([f]) => f.replace('site/', ''));
console.log(`\nsite/area/ に入るフォルダ（都道府県のはずです。違うものがあれば教えてください）: ${areaDirs.join(' ')}`);
if (!RUN) { console.log('\n（予行演習のため、ここで終了）'); process.exit(0); }

// ---- 実行
for (const [rel, body] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(p(rel)), { recursive: true }); fs.writeFileSync(p(rel), body); }
let gi = fs.existsSync(p('.gitignore')) ? fs.readFileSync(p('.gitignore'), 'utf8') : '';
for (const line of ['_public/', '_build/', '_build_area/']) if (!gi.split('\n').includes(line)) gi += (gi && !gi.endsWith('\n') ? '\n' : '') + line + '\n';
fs.writeFileSync(p('.gitignore'), gi);
fs.mkdirSync(p('site', 'area'), { recursive: true });
fs.mkdirSync(p('site', 'feature'), { recursive: true });
fs.mkdirSync(p('site', 'root-files'), { recursive: true });
for (const [f, t] of plan) {
  try { git(['mv', '--', f, t]); } catch (e) { fs.mkdirSync(path.dirname(p(t)), { recursive: true }); fs.renameSync(p(f), p(t)); }
}
// 空になった site/feature/ を片付ける（特集フォルダが無い場合）
for (const d of ['site/feature', 'site/root-files', 'site/area']) { try { if (!fs.readdirSync(p(d)).length) fs.rmdirSync(p(d)); } catch (e) {} }
console.log('\n移動しました。公開用フォルダを組み立てて、今の公開内容と照合します…\n');

// ---- 照合：組み立てた _public/ が、移動前の site/ と1バイトも違わないこと
const r = spawnSync(process.execPath, [p('tools', 'build-public.js'), '--out', '_public'], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (r.status !== 0) die('公開用フォルダを組み立てられませんでした。コミットせず、次のコマンドで元に戻してください:\n  git reset --hard\n  git clean -fd');
const after = new Map(walk(p('_public')).map(x => [x, sha(p('_public', x))]));
const missing = [], changed = [], extra = [];
for (const [k, v] of before) { if (!after.has(k)) missing.push(k); else if (after.get(k) !== v) changed.push(k); }
for (const k of after.keys()) if (!before.has(k)) extra.push(k);
console.log(`\n照合結果: 移動前 ${before.size} ファイル / 組み立て後 ${after.size} ファイル`);
console.log(`  消えたファイル ${missing.length} / 内容が変わったファイル ${changed.length} / 増えたファイル ${extra.length}`);
[...missing.map(x => '  消えた: ' + x), ...changed.map(x => '  変わった: ' + x), ...extra.map(x => '  増えた: ' + x)].slice(0, 30).forEach(l => console.log(l));
if (missing.length || changed.length || extra.length) die('公開内容が移動前と一致しません。コミットしないでください。元に戻す場合:\n  git reset --hard\n  git clean -fd');
console.log('\n✓ 公開内容は移動前と完全に一致しています（URLは1つも変わりません）。');
console.log(`
=== 次にやること ===
  1) git status で、移動（renamed）と、tools/・.github/ の追加だけになっているか確認
  2) git add -A && git commit -m "リポジトリの置き場所を整理" && git push
  3) GitHub の Actions タブで緑のチェックを待ち、サイトが今まで通り表示されるか確認
  4) 問題なければ、このスクリプト（migrate-layout.js）は削除してかまいません
`);
