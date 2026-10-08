#!/usr/bin/env bash
# おでかけナビ リポジトリ整理スクリプト
#
# 使い方（リポジトリ直下で実行）:
#   bash reorganize.sh          ← まず「予行演習」。何も変更せず、やる内容だけ表示
#   bash reorganize.sh --run    ← 実際に移動・削除（git管理なら git mv / git rm を使うので元に戻せる）
#
# 方針:
#   ・公開URLになるフォルダ（chiba, tokyo, event, season, purpose ...）と、
#     ルートに置く必要があるファイル（index.html, service-worker.js, site-ui.js, manifest.webmanifest,
#     sitemap.xml, robots.txt, llms.txt, 認証用ファイル, 画像）には触らない
#   ・移動先に同名ファイルが既にある場合は上書きせず、差分を知らせて止める（新しい方を人が選ぶ）
#   ・消すのは「どこからも参照されていないと確認できたもの」だけ

RUN=0; [ "${1:-}" = "--run" ] && RUN=1
USE_GIT=0; git rev-parse --is-inside-work-tree >/dev/null 2>&1 && USE_GIT=1
say() { echo "$*"; }

do_mv() {  # do_mv 元 先
  local src="$1" dst="$2"
  if [ ! -e "$src" ]; then say "  (なし)   $src"; return; fi
  if [ -e "$dst" ]; then
    if cmp -s "$src" "$dst"; then say "  (同一)   $src と $dst は同じ内容 → 元を消すだけでOK（手動）"; else say "  !! 要確認 $dst が既にあり、内容が違います（$src: $(date -r "$src" +%F) / $dst: $(date -r "$dst" +%F)）→ 新しい方を残して手動で置き換え"; fi
    return
  fi
  say "  移動     $src → $dst"
  [ $RUN -eq 1 ] || return
  mkdir -p "$(dirname "$dst")"
  if [ $USE_GIT -eq 1 ]; then git mv "$src" "$dst" 2>/dev/null || mv "$src" "$dst"; else mv "$src" "$dst"; fi
}

do_rm() {  # do_rm ファイル
  local f="$1"
  if [ ! -e "$f" ]; then say "  (なし)   $f"; return; fi
  say "  削除     $f"
  [ $RUN -eq 1 ] || return
  if [ $USE_GIT -eq 1 ]; then git rm -q "$f" 2>/dev/null || rm "$f"; else rm "$f"; fi
}

[ $RUN -eq 1 ] && say "=== 実行モード ===" || say "=== 予行演習（何も変更しません。--run で実行）==="

say; say "[1] データ → data/   （index.html は data/ を最初に探す作り。ビルド用スクリプトの既定パスも data/）"
do_mv spots.json       data/spots.json
do_mv hotels.json      data/hotels.json
do_mv event-data.json  data/event-data.json

say; say "[2] 作業用スクリプト → tools/"
do_mv build-static-pages.js  tools/build-static-pages.js
do_mv build-event-pages.js   tools/build-event-pages.js
do_mv check-data-blocks.js   tools/check-data-blocks.js
do_mv merge-event-data.js    tools/merge-event-data.js

say; say "[3] 一回きりの作業ファイル → tools/archive/（年パスは spots.json に反映済みのため）"
do_mv "apply annual pass.py"    tools/archive/apply_annual_pass.py
do_mv "annual pass data.json"   tools/archive/annual_pass_data.json

say; say "[4] サイトからは読まれない運用ファイル → backend/（Cloudflare Worker・GAS用）"
do_mv weather-proxy-worker.js  backend/weather-proxy-worker.js
do_mv worker-hardening.js      backend/worker-hardening.js
do_mv gas-hardening.js         backend/gas-hardening.js

say; say "[5] README → 旧READMEは docs/ へ、新READMEに差し替え"
do_mv README.md docs/experiences.md
if [ -f README_new.md ]; then
  say "  差し替え README_new.md → README.md"
  [ $RUN -eq 1 ] && mv README_new.md README.md
else
  say "  (README_new.md が見つかりません。リポジトリ直下に置いてから実行してください)"
fi

say; say "[6] 削除（参照ゼロを確認済み）"
say "  manifest.json は index.html・service-worker.js・静的ページのどこからも読まれず、実際に使われているのは manifest.webmanifest。"
say "  icon-512.png / icon-512-maskable.png は manifest.json だけが参照していました。"
do_rm manifest.json
do_rm icon-512.png
do_rm icon-512-maskable.png

say; say "[7] 自動では触らない（中身を見て判断）"
say "  ・facility-pages-all668.zip      … 668件時代の一括アップ用zipなら削除可（今は施設ページが直接フォルダにある）"
say "  ・slug manifest.json             … _slug_manifest.json（ビルドが作る方）と中身が同じなら削除"
say "  ・REPORT.md / unregistered-facilities… … 作業メモなら docs/ へ移すか削除"
say "  ・favicon-32.png / favicon-48.png / apple-touch-icon.png … 今あるページからは未参照。404.html や特集ページで使っていなければ削除可"
say "  ・_slug_manifest.json            … ビルドが出力するのでルートのまま"

say; say "=== 実行後に必ずやること ==="
say "  1) node tools/check-data-blocks.js index.html   （データの整合チェック）"
say "  2) node tools/build-area-pages.js --out _build_area  などビルドは『リポジトリ直下』で、tools/ を付けて実行"
say "  3) GitHub Pages に反映後、トップを開いて施設が表示されること、スマホで1回再読み込みして確認"
