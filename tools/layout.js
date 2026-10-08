'use strict';
/**
 * おでかけナビ：リポジトリの置き場所 ⇔ 公開URL の対応表
 *
 *   リポジトリ内                         公開されるURL
 *   index.html                       →  /index.html
 *   data/                            →  /data/
 *   photo/                           →  /img/
 *   site/area/<都道府県>/             →  /<都道府県>/        （例：site/area/chiba → /chiba/）
 *   site/feature/<特集>/              →  /<特集>/            （purpose, free, rainy-day, baby）
 *   site/event/                      →  /event/
 *   site/season/                     →  /season/
 *   site/root-files/<ファイル>        →  /<ファイル>         （service-worker.js, sitemap.xml など、ルート固定のもの）
 *
 * 新しい都道府県フォルダは site/area/ に、新しい特集フォルダは site/feature/ に入れるだけで、公開時に自動で最上位へ出ます。
 */
const FEATURES = ['purpose', 'free', 'rainy-day', 'baby'];

// 公開URLの最上位の名前（ファイル or フォルダ）から、リポジトリ内の置き場所を返す。null なら「ビルドの成果物としては扱わない」
function repoDestForPublic(name, isDir) {
  if (!isDir) return name === 'index.html' ? null : 'site/root-files/' + name;
  if (name === 'event' || name === 'season') return 'site/' + name;
  if (name === 'data' || name === 'img') return null;
  if (FEATURES.includes(name)) return 'site/feature/' + name;
  return 'site/area/' + name;
}
module.exports = { FEATURES, repoDestForPublic };
