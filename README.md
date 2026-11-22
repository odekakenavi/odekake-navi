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
│   ├─ transit_table.json   電車の所要時間表（ターミナル100駅→各施設。tools/build_transit_table.py で作成）
│   └─ event-data.json      イベント特集用データ（merge-event-data.js で spots.json に反映）
│
├─ tools/                 ページ生成・チェック用スクリプト（PCで実行）
│   ├─ build-static-pages.js   施設ページ・地域ページの生成
│   ├─ build-area-pages.js     複数市区町村をまとめたエリア特集の生成
│   ├─ build-event-pages.js    イベント特集（/event/…）の生成
│   ├─ build-holiday-pages.js  年末年始・冬休み特集（/event/fuyuyasumi/）の生成
│   ├─ build-feature-pages.js  目的別（/purpose/…）・雨の日・無料・赤ちゃん向けの特集の生成
│   ├─ site-header.js          静的ページ共通のヘッダー・☰メニュー・イベントの並び順（上の build-*.js が読み込む。同じ tools/ に置く）
│   ├─ merge-event-data.js     event-data.json を spots.json に反映
│   ├─ check-data-blocks.js    データ整合チェック（ファイルは書き換えない）
│   ├─ build_transit_table.py  電車の所要時間表の生成（Python3。駅データ.jp のCSVが必要）
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
3. `tools/refresh-static-pages.js` … 施設・地域・季節・エリア特集ページと sitemap.xml を、いまの data/spots.json から自動で作り直す（目的別 /purpose/…・雨の日・無料・赤ちゃん向けの特集ページは `tools/build-feature-pages.js` が作る）
4. `tools/check-site.js --public _public` … sitemapとページの対応・noindex・canonical・リンク切れを最終確認

→ 施設データ（data/spots.json）を更新するだけで、静的ページもsitemapも自動で最新になります。生成したページをリポジトリにアップする必要はありません。
結果は GitHub の「Actions」タブ → 最新の実行 → Summary で確認できます（⚠注意は公開を止めず一覧表示のみ）。

手元で同じチェックをする場合：
```
node tools/check-site.js
node tools/build-public.js --out _public && node tools/refresh-static-pages.js --public _public && node tools/check-site.js --public _public
```

## 静的ページの共通部分（ヘッダー・予約リンク・共有URL）

**共通ヘッダー（`tools/site-header.js`）**

- 施設・地域・季節・エリア・イベント・年末年始・目的別などの静的ページは、すべてアプリ本体と同じロゴ付きヘッダーを使います（左に☰メニュー、右に×＝トップへ戻る、🔗共有）。
- ☰メニューの中身は静的ページへの普通のリンクです（都道府県・エリア特集・目的・季節/条件・イベント）。リンクを増やすときは `SITE_HEADER_LINKS`、イベントを増やすときは `EVENT_NAV` を編集します。ヘッダーの見た目を直すときも `site-header.js` だけです。
- イベントの並び順（特集ページ上部の切り替えチップと☰メニュー）は `EVENT_NAV` で決まります。アプリのハンバーガーメニューと同じく、1月ごろのイベント（いちご狩り）から季節順です。
- `build-static-pages.js` / `build-area-pages.js` / `build-event-pages.js` / `build-holiday-pages.js` / `build-feature-pages.js` は `site-header.js` を読み込みます。**同じ `tools/` に置いてください**（欠けるとページ生成が止まります）。
- 公開URLのベース（`/odekake-navi/`）は `site-header.js` の先頭の `BASE` です。

**予約リンクのアフィリエイト変換**

- 静的な施設ページの「予約情報」は、アソビュー!・じゃらんのURLをバリューコマース経由に変換して出します（`build-static-pages.js` の `VC_SID` / `VC_PIDS`）。値は `index.html` 側のもの（`VC_SID` / `VC_PID`）と**必ずそろえてください**。
- `data/spots.json` の `bookingLinks` には、変換前の素のURLを入れます（バリューコマースのURLを直接入れない）。
- リンクには `rel="sponsored nofollow noopener"` と `[PR]` の注記を付けています。

**共有URLの動き**

- 施設ページ（`/chiba/sodegaura/tokyo-doitsumura/` など）を人が開くと、アプリの `?spot=施設名`（トップからたどったときと同じ詳細画面）に自動で切り替わります。
- 検索エンジンやSNS・LINEのプレビュー用のボットには、これまで通り静的HTMLを見せます（検索結果・リンクプレビュー用）。
- 静的HTMLのまま確認したいときは、URLの末尾に `?static=1` を付けます。
- 地域・エリア・特集ページは切り替えません。

## 電車の所要時間（概算）

カードに出る「電車で（目安）」は、時刻表ではなく概算です。

**計算の流れ**（`index.html` の `deriveTransitMinutes`）

1. 施設に `transitMinutesOverride` があれば、その値をそのまま使います。
2. `data/transit_table.json` があり、その施設の行があれば、出発地に近いターミナル駅3つのうち最短を採用します。
   所要時間 ＝ 出発地→ターミナルの概算（従来式）＋ 表の値（ターミナル→最寄り駅の乗車・乗換＋駅から徒歩/バス）
3. 表が無い・施設が表に無い・出発地が現在地設定と合わないときは、従来の直線距離ベースの式（`estimateTransitMinutes`）に戻ります。

**表の中身**（`data/transit_table.json`）

- ターミナル100駅（東京・神奈川・埼玉・千葉・茨城・栃木・群馬の主要駅と、甲府・河口湖・熱海・三島・軽井沢）から各施設までの分数です。`hubs` が駅の一覧、`t` が施設の `slug` ごとの配列（0は到達不可）です。
- 駅データ.jp の路線グラフを最短経路で解いています。乗換は1回6分、ターミナルでの待ちは5分を加算します。
- 施設の最寄り駅は `access` の「駅名」と「徒歩○分／バス○分」から読み取ります。バスの記載がある場合は、バス時間＋待ち5分を加えます。
- 最寄り駅が読み取れない施設（バス停・高速ICのみの記載など）は表に入らず、従来式で計算されます。

**限界**

- 無料版の駅データには新幹線の駅が入っていません。軽井沢・那須塩原・熱海など新幹線が便利な場所は、在来線の経路で出るため長めになります。
- 特急・急行の停車駅や本数、時間帯による違いは反映されません。速度は路線種別ごとの値（`SPEED`）で、ハブ間の実際の所要時間と見比べて校正しています。中距離でおおむね±15%、短距離はやや短め、特急区間は長めに出ます。
- 個別に直したい施設は、`transitMinutesOverride` に分数を入れてください。

## AI検索・クローラー対応

ChatGPT検索（OAI-SearchBot）などのAI検索や、Bingに見つけてもらうための設定です。

**robots.txt（置き場所に注意）**

- このサイトのURLは `/odekake-navi/` 配下（GitHub Pagesのプロジェクトページ）のため、このリポジトリの `robots.txt` はクローラーに読まれません。
- 実際に効くのは、別リポジトリ `odekakenavi/odekakenavi.github.io` のルートに置いた `robots.txt` です（`https://odekakenavi.github.io/robots.txt` で表示できることを確認済み）。
- robots.txt を変更するときは **そちらのリポジトリを編集**し、このリポジトリのファイルとも内容を揃えます。
- `odekakenavi.github.io` リポジトリには robots.txt だけを置きます。`index.html` を置くとドメイン直下にそのページが公開されてしまうため置かないでください。
- OAI-SearchBot・ChatGPT-User・GPTBot・PerplexityBot・Claude系などは `Allow: /` で許可しています。

**sitemap.xml**

- Google Search Console と Bing Webmaster Tools に登録済みです。
- sitemap.xml は公開の流れ（自動）で毎回作り直されます。

**IndexNow（Bingへの更新通知）**

- キーファイル `adea0d8fbd70cf174a740d6ee8694a4a.txt` を使います（**消さない・名前を変えない**）。置き場所は `site/root-files/` です。公開URLは `https://odekakenavi.github.io/odekake-navi/adea0d8fbd70cf174a740d6ee8694a4a.txt` です。
- キーファイルを `/odekake-navi/` 配下に置いているため、通知できるのは `/odekake-navi/` 以下のURLだけです。
- ページを追加・更新したときは、次のURLをブラウザで開くと1ページずつ通知できます。

```
https://api.indexnow.org/indexnow?url=<通知するURL>&key=adea0d8fbd70cf174a740d6ee8694a4a&keyLocation=https://odekakenavi.github.io/odekake-navi/adea0d8fbd70cf174a740d6ee8694a4a.txt
```

- 200または202が返れば受付済みです。
- キーは公開される前提の文字列で、秘密情報ではありません。
- リポジトリ直下に置いても公開されません。`tools/build-public.js` は、`site/root-files/` の中身だけを公開のルート直下に配置します（robots.txt などと同じ扱い）。

## 更新の流れ（PCで作業するとき）

リポジトリ直下で実行します。

```
node tools/check-data-blocks.js index.html
node tools/merge-event-data.js data/spots.json data/event-data.json
node tools/build-area-pages.js --index index.html --spots data/spots.json --sitemap sitemap.xml --out _build_area
```

各スクリプトの詳しい使い方・オプションは、ファイル先頭のコメントを見てください。

### 電車の所要時間表を作り直すとき

施設の追加・最寄り駅（`access`）の変更をしたあと、または駅データを更新したときに実行します。

```
python3 tools/build_transit_table.py --data-dir <駅データのフォルダ> --spots data/spots.json --out data/transit_table.json
```

- `<駅データのフォルダ>` には、[駅データ.jp](https://ekidata.jp/) の `station*.csv`・`line*.csv`・`join*.csv`（あれば `company*.csv`）を入れます。CSVはリポジトリに入れず、手元に置いてください（利用規約は駅データ.jp で確認）。
- 実行の最後に「ハブ ○○ / 100」「表あり ○○ 件」と、駅データに一致しなかった駅名が表示されます。一致しなかった駅名は `spots.json` の `access` の表記ゆれ・誤記の可能性があります。
- 校正用に、ターミナル駅どうしの所要時間を見たいときは `--hub-matrix hub_matrix.json` を付けます。

## ライセンス

All rights reserved（詳細は `LICENSE`）。
