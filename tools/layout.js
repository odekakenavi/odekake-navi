
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

// 公開URLの最上位の名前から配置先を返す
function repoDestForPublic(name, isDir) {

  // ファイル
  if (!isDir) {
    return name === 'index.html'
      ? null
      : 'site/root-files/' + name;
  }

  // 専用フォルダ
  if (name === 'event' || name === 'season') {
    return 'site/' + name;
  }

  // データ・画像は別管理
  if (name === 'data' || name === 'img') {
    return null;
  }

  // 特集ページ
  if (FEATURES.includes(name)) {
    return 'site/feature/' + name;
  }

  // その他は都道府県フォルダ
  return 'site/area/' + name;
}

module.exports = {
  FEATURES,
  repoDestForPublic
};
