'use strict';

/**
 * おでかけナビ：リポジトリの置き場所 ⇔ 公開URL の対応表
 *
 * リポジトリ内                         公開されるURL
 * index.html                       →  /index.html
 * data/                            →  /data/
 * photo/                           →  /img/
 * site/area/<都道府県>/             →  /<都道府県>/
 * site/feature/<特集>/              →  /<特集>/
 * site/event/                      →  /event/
 * site/season/                     →  /season/
 * site/root-files/<ファイル>        →  /<ファイル>
 *
 * 新しい特集は FEATURES に追加する
 */

// 特集ページ一覧
const FEATURES = [
  'purpose',
  'free',
  'rainy-day',
  'baby',
  'minna'
];

// 専用フォルダ（そのまま site/<名前> に置く）
const DEDICATED_DIRS = ['event', 'season'];

// リポジトリ直下で別管理（このスクリプトの配置対象外）
const SEPARATE_DIRS = ['data', 'img'];

// 公開物ではないもの（都道府県扱いにしない）
const IGNORED_NAMES = [
  'node_modules',
  'site',
  'photo',
  'scripts',
  'docs',
  'tmp'
];

function isIgnoredName(name) {
  // .git / .github / .vscode など、ドット始まりは全て除外
  return name.startsWith('.') || IGNORED_NAMES.includes(name);
}

// 公開URLの最上位の名前から配置先を返す
// 戻り値: 配置先の文字列 / null（配置対象外）
function repoDestForPublic(name, isDir) {

  if (typeof name !== 'string' || name === '') {
    return null;
  }

  // ファイル
  if (!isDir) {
    if (name === 'index.html' || name.startsWith('.git')) {
      return null;
    }
    // .nojekyll など公開に必要なドットファイルは root-files に入れる
    return 'site/root-files/' + name;
  }

  // 専用フォルダ
  if (DEDICATED_DIRS.includes(name)) {
    return 'site/' + name;
  }

  // データ・画像は別管理
  if (SEPARATE_DIRS.includes(name)) {
    return null;
  }

  // 公開物でないフォルダ
  if (isIgnoredName(name)) {
    return null;
  }

  // 特集ページ
  if (FEATURES.includes(name)) {
    return 'site/feature/' + name;
  }

  // その他は都道府県フォルダ
  return 'site/area/' + name;
}

// リポジトリ内のパスから公開URLのパス（先頭スラッシュなし）を返す
// 戻り値: 公開パスの文字列 / null（公開されない）
function publicPathFromRepo(repoPath) {
  const p = String(repoPath).replace(/\\/g, '/').replace(/^\.?\//, '');

  const rules = [
    [/^photo\//, 'img/'],
    [/^site\/area\//, ''],
    [/^site\/feature\//, ''],
    [/^site\/event(\/|$)/, 'event$1'],
    [/^site\/season(\/|$)/, 'season$1'],
    [/^site\/root-files\//, '']
  ];

  for (const [re, rep] of rules) {
    if (re.test(p)) {
      return p.replace(re, rep);
    }
  }

  if (p === 'index.html' || p === 'data' || p.startsWith('data/')) {
    return p;
  }

  return null;
}

module.exports = {
  FEATURES,
  repoDestForPublic,
  publicPathFromRepo
};
