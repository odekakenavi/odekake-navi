# おでかけナビ 追加機能 まとめ（最新）

## 反映するファイル（サイトのリポジトリへ。同じ名前で上書き）
- `index.html` … 通知カード（初回の大きなカード・設定画面のスイッチ）、「今だけ」バッジ、位置情報の自動確認の見直し
- `service-worker.js` … 通知の受信・タップ、「今週末で終わるイベント◯件」（端末内のデータから集計）

## Cloudflare（Worker）側
- `odekake-push/worker/src/index.js` … 登録の受付・毎週金曜の配信・件数カウント（すでにデプロイ済み。今回の変更なし）
- `odekake-push/worker/wrangler.toml` … 参考（ダッシュボードで設定した内容と同じ）
- 配信状況: `https://odekake-push.odekakenavi2026.workers.dev/admin/stats?key=（ADMIN_TOKEN）`

## 動き
- 通知カード：2回目の訪問から表示。×で閉じる／設定からオフにしたら二度と出さない。オン・オフは「☰メニュー」→「設定」
- 位置情報：断った人には自動では聞かない（「現在地から探す」「診断の現在地」ボタンのときだけ）。許可を覚えていないブラウザでは、聞かずに保存済みの位置を使う
- 今だけバッジ：終了が近いイベントに「今週末まで」「あと◯日」など
- 金曜17時（日本時間）の通知：今週末に終わるイベントがあれば件数入り、なければ月ごとの文面
- イベント終了日の上限（現在はクリスマス 12/25）は `index.html` の `EVENT_UNTIL` にだけ書く。「12-25」のように月-日で書けば、毎年そのイベント自身の年に当てはまる（年の書き換えは不要）。サイトを開くと端末に保存され、通知の集計（`service-worker.js`）が自動で読む
- iPhoneで通知を使うには、`manifest.webmanifest` の `display` が `standalone`（または `fullscreen`）である必要がある

## 補足
- `odekake-push/sw-push-snippet.js` は参考用（通常は使わない）

## 「ごはん事情」と「lunch」を1つにまとめる（正は `food.lunch`）
`index.html` は、新しい形（`food.lunch`）でも、移行前の形（`lunch`）でも読めます。そのため、次の順で進めれば途中で何が起きてもサイトは壊れません。
1. 新しい `index.html` をアップロードする（データはまだ触らない）
2. `tools/migrate_lunch_to_food.py` で確認だけ行う：`python3 tools/migrate_lunch_to_food.py data/spots.json`
3. 「要確認」が出たら、その分だけ手で直す（スクリプトは触りません）
4. 問題なければ `--write` を付けて実行 → `data/spots.json` を差し替える（元は `.bak` に残る）
5. サイトで、何件かのスポットの詳細「🍙 ごはん事情」が移行前と同じ表示か確認する
- リポジトリ内に他にも `lunch` を読むファイル（ページ生成の道具など）がないか、GitHubの検索で「lunch」を探してから進めてください
