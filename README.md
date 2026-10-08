# おでかけナビ 〜今日、子どもとどこ行く？

子連れ向けのおでかけスポット検索サイト。関東1都6県＋山梨・静岡・福島・長野の施設とファミリー向けホテルを掲載しています。

公開URL: https://odekakenavi.github.io/odekake-navi/

## フォルダ構成

リポジトリ内の置き場所と、公開されるURLは別々です。公開の直前に `tools/build-public.js` が組み立てるので、**公開URLは変わりません**。

```
/
├─ index.html             アプリ本体（公開URL: /）
├─ data/                  施設・ホテル・イベントのデータ（公開URL: /data/）
│   ├─ spots.json           施設データ
│   ├─ hotels.json          ホテルデータ
│   └─ event-data.json      イベント特集用データ（merge-event-data.js で spots.json に反映）
├─ photo/                 画像（公開URLは /img/ になる）
│
├─ site/                  公開ページ
│   ├─ area/                都道府県フォルダ（chiba, tokyo …）→ 公開URL /chiba/ …
│   ├─ event/               イベント特集 → /event/
│   ├─ season/              季節ページ → /season/
│   ├─ feature/             purpose, free, rainy-day など → /purpose/ …
│   └─ root-files/          ルートに置く必要があるファイル（→ /）
│                           service-worker.js, site-ui.js, manifest.webmanifest, sitemap.xml, robots.txt, llms.txt,
│                           404.html, 検索エンジンの確認用ファイル, アイコン, og-image.png など
│
├─ tools/                 ページ生成・チェック用スクリプト（PCで実行）
│   ├─ build-static-pages.js   施設ページ・地域ページ・季節ページの生成
│   ├─ build-area-pages.js     複数市区町村をまとめたエリア特集の生成
│   ├─ build-event-pages.js    イベント特集（/event/…）の生成
│   ├─ place-build.js          生成結果（_build/）を正しい置き場所へ入れる
│   ├─ build-public.js         公開用フォルダ（_public/）の組み立て（GitHub Actionsも使用）
│   ├─ layout.js               置き場所と公開URLの対応表
│   ├─ merge-event-data.js     event-data.json を spots.json に反映
│   ├─ check-data-blocks.js    データ整合チェック（ファイルは書き換えない）
│   └─ archive/                一回きりの作業ファイル
├─ backend/               サイトからは読まれない運用用コード（天気プロキシ、GASの対策サンプル）
├─ docs/                  作業報告・仕様メモ
└─ .github/workflows/pages.yml   公開用の設定（push すると自動で公開）
```

- 新しい都道府県フォルダは `site/area/` に、新しい特集フォルダは `site/feature/` に入れるだけで、公開時に自動で最上位へ出ます。
- 公開URLになるフォルダ名（`chiba`、`event` など）は、変えると検索結果・共有されたURLが切れるため、変更しないでください。
- 同じURLに2つのファイルが重なる場合や、必須ファイルが無い場合、公開用の組み立てがエラーで止まり、公開されません。

## 更新の流れ（PCで作業するとき）

リポジトリ直下で実行します。

```
node tools/check-data-blocks.js index.html
node tools/merge-event-data.js data/spots.json data/event-data.json

# ページの生成（出力は _build/ へ）→ 正しい置き場所へ入れる
node tools/build-static-pages.js --out _build --keep-sitemap site/root-files/sitemap.xml
node tools/build-event-pages.js --out _build
node tools/place-build.js _build

# エリア特集（出力は _build_area/ へ）
node tools/build-area-pages.js --sitemap site/root-files/sitemap.xml --out _build_area
node tools/place-build.js _build_area

# 手元で確認したい時（公開時は GitHub Actions が自動で実行します）
node tools/build-public.js --out _public
node tools/build-static-pages.js --compare _public
```

そのあと `git add -A`、`git commit`、`git push` で公開されます（公開の進み具合は GitHub の Actions タブで確認できます）。
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
