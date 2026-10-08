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
├─ docs/                  作業報告・仕様メモ（seo-static-pages-report.md ＝静的ページ生成の報告書）
├─ experiences/           （計画中・未作成）「実際に行ったよ」の実体験データ置き場。仕様は下の「実体験データの仕様」参照
│
└─ chiba/ tokyo/ kanagawa/ …   公開ページ（都道府県・市区町村・施設）
   event/ season/ purpose/ free/ rainy-day/   特集ページ
```

公開URLになるフォルダは、フォルダ名を変えると検索結果・シェアされたURLが切れるため移動しないでください。

## 更新の流れ（PCで作業するとき）

リポジトリ直下で実行します。

```
node tools/check-data-blocks.js index.html
node tools/merge-event-data.js data/spots.json data/event-data.json
node tools/build-area-pages.js --index index.html --spots data/spots.json --sitemap sitemap.xml --out _build_area
```

各スクリプトの詳しい使い方・オプションは、ファイル先頭のコメントを見てください。

## 実体験データの仕様（「📸 実際に行ったよ」・計画中）

> 現在は設計メモです。`experiences/` フォルダと `tools/build-experience-index.js` は、実装するときに作ります。

施設基本データ（index.html 内の SPOTS）とは完全に分離した、実体験・写真のデータ置き場です。

### ファイル構成
- `index.json` … 実体験がある施設の目次（`tools/build-experience-index.js` で自動生成）
- `<facilityId>.json` … 1施設分。例: `tokyo/taito/ueno.json`（facilityId = 施設ページURLのスラッグ）
- `photos/` … 写真本体（置き場所は自由。外部ストレージ/CDNの https:// URL をそのまま書いてもよい）
- `_template.json` … 記入用の雛形（公開・読み込み対象外）

### 1施設ファイルの形式
`{ "facilityId": "...", "experiences": [ 記録, 記録, ... ] }`
1施設に複数回分の記録を並べられます（表示は訪問日の新しい順）。

### 記録の項目（固定仕様）
| 項目 | 内容 |
|---|---|
| `id` | 記録ID（施設内で一意） |
| `facilityId` | 施設ID（ファイルのfacilityIdと同じ） |
| `status` | `published`＝掲載 / `pending`＝確認待ち / `hidden`＝非掲載。**publishedのみ表示** |
| `visitDate` | 訪問日 `YYYY-MM` または `YYYY-MM-DD` |
| `party` | `adults`（大人の人数）, `children`（子どもの人数）, `childAges`（例 `["3歳","6歳"]`） |
| `transport` | `car` / `train` / `bus` / `bicycle` / `walk` / `other` |
| `stayMinutes` | 滞在時間（分） |
| `costs` | `adult` `child` `parking` `other` `total`（すべて円・数値。未入力の項目は省略可） |
| `kids` | `stroller` `toddlerFun`（0〜5歳程度） `elementaryFun`（小学生） `meals` `diaperChange` `nursing` `restBreak`。各 `{ "level": "easy"｜"partial"｜"hard", "note": "自由記述" }` |
| `learned` | 行ってみて分かったこと（自由記述） |
| `photos` | `[{ "url", "category", "caption" }]`。categoryは下記 |
| `meta` | `submittedAt` `reviewedAt` `source`（`form`/`manual`）。運営用で画面には表示しない |

写真カテゴリー: `entrance`（外観・入口）/ `parking`（駐車場）/ `play`（子どもが遊ぶ場所）/ `meal_rest`（食事・休憩）/ `other`（その他）
写真URL: `https://` の絶対URL、または `photos/` からの相対パス（例 `ueno/2026-09-a/entrance.jpg`）。

星評価・総合点・ランキング・おすすめ度に当たる項目は、仕様として持ちません。

### 追加手順
1. `_template.json` をコピーして `experiences/<facilityId>.json` を作る（既にあれば `experiences` 配列に追記）
2. 確認できたら `status` を `published` に変更
3. `node tools/build-experience-index.js` を実行（検証＋`index.json`更新）
4. 変更ファイルをGitHubへアップロード
削除は該当記録を消す（または `hidden` にする）→ 手順3。

### 外部CDNの写真を使う場合
index.html の CSP（`img-src`）は現在 `'self' data:` のみです。外部の https 画像を使うときは、そのドメインを `img-src` に追加してください。同じサイト内（`photos/`）に置く場合は変更不要です。

## ライセンス

All rights reserved（詳細は `LICENSE`）。
