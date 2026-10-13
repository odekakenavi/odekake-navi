# おでかけナビ 〜今日、子どもとどこ行く？

子連れ向けのおでかけスポット検索サイト。関東1都6県＋山梨・静岡・福島・長野の施設とファミリー向けホテルを掲載しています。

公開URL: https://odekakenavi.github.io/odekake-navi/

## フォルダ構成

```
/
├─ index.html             アプリ本体（データは data/ から読み込み）
├─ service-worker.js      キャッシュ制御（ルート固定）
├─ site-ui.js             特集ページ共通の翻訳ボタンなど（ルート固定・/odekake-navi/site-ui.js で読まれる）
├─ manifest.webmanifest   PWA設定
├─ sitemap.xml / robots.txt / llms.txt   検索・AI向け
├─ BingSiteAuth.xml, google….html        検索エンジンの所有権確認用（消さない）
├─ 画像                    header.webp, operator.webp, og-image.png, icon-192.png, pwa-*.png
│
├─ data/                  施設・ホテル・イベントのデータ
│   ├─ spots.json           施設データ
│   ├─ hotels.json          ホテルデータ
│   └─ event-data.json      イベント特集用データ（merge-event-data.js で spots.json に反映）
│
├─ tools/                 ページ生成・チェック用スクリプト（PCで実行）
│   ├─ build-static-pages.js   施設ページ・地域ページの生成
│   ├─ build-area-pages.js     複数市区町村をまとめたエリア特集の生成
│   ├─ build-event-pages.js    イベント特集（/event/…）の生成
│   ├─ merge-event-data.js     event-data.json を spots.json に反映
│   ├─ check-data-blocks.js    データ整合チェック（ファイルは書き換えない）
│   └─ archive/                一回きりの作業ファイル
│
├─ backend/               サイトからは読まれない運用用コード
│   ├─ weather-proxy-worker.js   天気APIのプロキシ（Cloudflare Worker）
│   ├─ worker-hardening.js       Worker側の対策サンプル
│   └─ gas-hardening.js          みんなのおでかけ（GAS）側の入力対策サンプル
│
├─ docs/                  仕様メモ（experiences.md ＝「実際に行ったよ」の設計メモ）
│
└─ chiba/ tokyo/ kanagawa/ …   公開ページ（都道府県・市区町村・施設）
   event/ season/ purpose/ free/ rainy-day/   特集ページ
```

公開URLになるフォルダは、フォルダ名を変えると検索結果・シェアされたURLが切れるため移動しないでください。

## 公開の流れ（自動）

main に push すると GitHub Actions（`.github/workflows/pages.yml`）が次を自動で行います。

1. `tools/check-site.js` … データの自動チェック（JSONの破損・slug重複・緯度経度・URLの形など）。エラーなら**公開せず止まる**（いまのサイトはそのまま）
2. `tools/build-public.js` … 公開用の形（_public/）を組み立て
3. `tools/refresh-static-pages.js` … 施設・地域・季節・エリア特集ページと sitemap.xml を、いまの data/spots.json から自動で作り直す
4. `tools/check-site.js --public _public` … sitemapとページの対応・noindex・canonical・リンク切れを最終確認

→ 施設データ（data/spots.json）を更新するだけで、静的ページもsitemapも自動で最新になります。生成したページをリポジトリにアップする必要はありません。
結果は GitHub の「Actions」タブ → 最新の実行 → Summary で確認できます（⚠注意は公開を止めず一覧表示のみ）。

手元で同じチェックをする場合：
```
node tools/check-site.js
node tools/build-public.js --out _public && node tools/refresh-static-pages.js --public _public && node tools/check-site.js --public _public
```

## 更新の流れ（PCで作業するとき）

リポジトリ直下で実行します。

```
node tools/check-data-blocks.js index.html
node tools/merge-event-data.js data/spots.json data/event-data.json
node tools/build-area-pages.js --index index.html --spots data/spots.json --sitemap sitemap.xml --out _build_area
```

各スクリプトの詳しい使い方・オプションは、ファイル先頭のコメントを見てください。

## ライセンス

All rights reserved（詳細は `LICENSE`）。
