/*
 * ==================================================================
 * 🚀 おでかけナビ Service Worker
 * ------------------------------------------------------------------
 * 【方針（最重要）】
 *  ・index.html（ページ本体）と 施設／ホテルデータ（spots.json 等）は、
 *    「オンライン時は常にネットワークから最新版を取得」し、取得できた
 *    ときだけキャッシュを更新する（Network First）。
 *    オフライン時（＝本当にネットワークへ到達できない場合）だけ、
 *    最後に正常取得できたキャッシュを表示する。
 *  ・「古いデータを固定的にキャッシュする（Cache First）」方式には、
 *    index.html と spots.json / hotels.json のどちらも絶対にしない。
 *  ・アイコンや manifest.json などのPWAに最低限必要な静的ファイルだけ、
 *    CACHE_VERSION 付きでバージョン管理してキャッシュする。
 *  ・GitHub Pages のプロジェクトページ（https://<user>.github.io/<repo>/ の
 *    ようなサブパス）でも正しく動くよう、パスはすべて service-worker.js
 *    自身の登録スコープからの相対パスとして扱い、ドメインやサブパスを
 *    コードに直接書かない。
 *  ・施設ページ（/kanagawa/yokohama/xxx/ 等）への直接アクセスは、既存の
 *    GitHub Pages 404.html によるリダイレクト復元の仕組みに一切干渉しない。
 *    ネットワーク応答が得られた場合（200でも404でも）はそのまま返し、
 *    「本当にネットワークへ到達できなかった場合」だけキャッシュへ
 *    フォールバックする。
 * ==================================================================
 */
"use strict";

// 🆕 CSS・JS相当の静的ファイルやHTMLの「オフライン用シェル」を更新したら、
//    このバージョンを上げるだけで古いキャッシュが安全に破棄される。
//    （例："v1.0.1" のように上げる）
const CACHE_VERSION = "v1.0.0";
const CACHE_PREFIX = "odekake-";
const STATIC_CACHE = CACHE_PREFIX + "static-" + CACHE_VERSION;
const DATA_CACHE = CACHE_PREFIX + "data-" + CACHE_VERSION;

// service-worker.js 自身の登録スコープを基準に、相対パスでURLを組み立てる
// （ドメイン名やサブパスをハードコードしない＝GitHub Pagesのサブディレクトリ公開でもそのまま動く）
function scopeUrl(){
  try{ return new URL(self.registration.scope); }
  catch(e){ return new URL(self.location.href); }
}
function scopedUrl(relPath){
  return new URL(relPath, scopeUrl()).toString();
}

// オフライン時の最終フォールバックとして使う、トップページ（index.html）のキャッシュキー
const OFFLINE_SHELL_URL = scopedUrl("./");

// 🆕 PWAとして最低限必要な静的ファイルだけを事前キャッシュする。
//    既存の機能・デザインそのものをキャッシュ対象にするわけではなく、
//    あくまで「オフライン時にも最低限の画面を出す」ための保険。
//    1ファイルでも取得に失敗してもinstall全体は失敗させない（初回アクセス時のエラー防止）。
const PRECACHE_URLS = [
  OFFLINE_SHELL_URL,
  scopedUrl("icons/manifest.json"),
  scopedUrl("icons/icon-192.png"),
  scopedUrl("icons/apple-touch-icon.png")
];

// 施設データ・ホテルデータ判定：既存ローダー（DATA_SOURCES）の複数の候補ファイル名と一致させる。
// 将来ファイル名の候補が増えた場合は、ここに1行足すだけでよい。
const DATA_FILE_RE = /\/(data\/spots\.json|data_spots\.json|spots\.json|data spots\.json|data\/hotels\.json|data_hotels\.json|hotels\.json|data hotels\.json)$/;
function isDataRequest(url){
  return DATA_FILE_RE.test(decodeURIComponent(url.pathname));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try{
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(PRECACHE_URLS.map(async (u) => {
        try{
          const res = await fetch(u, { cache: "no-cache" });
          if(res && res.ok) await cache.put(u, res.clone());
        }catch(e){ /* 個別ファイルの事前キャッシュ失敗は無視して続行（初回アクセス時のエラー防止） */ }
      }));
    }catch(e){ /* 事前キャッシュに失敗してもインストール自体は続ける */ }
    // ここでは self.skipWaiting() を呼ばない：既存タブを開いたユーザーを急に切り替えない。
    // 反映は activate 側の制御と、ページ側からの明示的な更新操作（SKIP_WAITING メッセージ）に委ねる。
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 前のバージョンのキャッシュ（odekake- で始まり、現在のバージョンと一致しないもの）だけを破棄する
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if(name.indexOf(CACHE_PREFIX) === 0 && name !== STATIC_CACHE && name !== DATA_CACHE){
        return caches.delete(name);
      }
      return Promise.resolve();
    }));
    await self.clients.claim(); // 開いているタブにも、次のリクエストから新しいSWを適用する
  })());
});

// ページ側（更新通知のボタンなど、ユーザー操作をきっかけにした場合のみ）から呼ばれる。
// Service Worker側から自発的にskipWaitingはしない＝無限リロード・意図しない切り替えを避ける。
self.addEventListener("message", (event) => {
  if(event && event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ------------------------------------------------------------------
// ① ナビゲーション（HTML）：ネットワーク優先
// ------------------------------------------------------------------
// 取得できた場合は、ステータス（200・404など）にかかわらずそのまま返す。
// これにより、GitHub Pagesの404.htmlによる施設URLの復元処理をそのまま活かす。
// 本当にネットワークへ到達できない時だけ、キャッシュ済みのトップページを返す。
async function handleNavigation(request){
  try{
    const res = await fetch(request);
    if(res && res.ok){
      try{
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(OFFLINE_SHELL_URL, res.clone());
      }catch(e){ /* キャッシュ更新に失敗しても表示は継続 */ }
    }
    return res;
  }catch(networkErr){
    try{
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(OFFLINE_SHELL_URL);
      if(cached) return cached;
    }catch(e){ /* キャッシュ参照にも失敗した場合は下のフォールバックへ */ }
    // 事前キャッシュもまだ無い（初回アクセスかつオフライン）場合の、最低限の案内表示
    return new Response(
      "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>おでかけナビ</title>" +
      "<body style=\"font-family:sans-serif;padding:24px;color:#2B2620;background:#FBF7EF;\">" +
      "<p>現在オフラインのため表示できません。通信状態を確認して、もう一度お試しください。</p>" +
      "</body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// ------------------------------------------------------------------
// ② 施設・ホテルデータ（spots.json / hotels.json）：ネットワーク優先
// ------------------------------------------------------------------
// 取得できた（正常応答の）場合だけキャッシュを更新する＝失敗した古い応答でキャッシュを汚さない。
// 取得できない時だけ、最後に正常取得できたキャッシュにフォールバックする。
async function handleDataRequest(request){
  try{
    const res = await fetch(request, { cache: "no-cache" });
    if(res && res.ok){
      try{
        const cache = await caches.open(DATA_CACHE);
        await cache.put(request, res.clone());
      }catch(e){ /* キャッシュ更新に失敗しても表示は継続 */ }
    }
    return res;
  }catch(networkErr){
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(request);
    if(cached) return cached;
    // フォールバックも無ければネットワークエラーをそのまま投げ、既存ローダー側のエラー表示に委ねる
    throw networkErr;
  }
}

// ------------------------------------------------------------------
// ③ 静的アセット（manifest.json・アイコン等）：Stale-While-Revalidate
// ------------------------------------------------------------------
// キャッシュがあればまず即座に返しつつ、裏側で最新版を取得してキャッシュを更新する。
// CACHE_VERSIONを上げてデプロイすれば、activate時に前のバージョンごと入れ替わる。
async function handleStaticAsset(request){
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((res) => {
    if(res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if(cached) return cached;
  const fromNetwork = await networkPromise;
  return fromNetwork || fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if(request.method !== "GET") return; // POST等は素通し（既存の挙動のまま）

  let url;
  try{ url = new URL(request.url); }catch(e){ return; }
  if(url.origin !== self.location.origin) return; // 外部ドメイン（CDN・GA4・翻訳等）はSWを介さず既存のまま

  if(request.mode === "navigate"){
    event.respondWith(handleNavigation(request));
    return;
  }
  if(isDataRequest(url)){
    event.respondWith(handleDataRequest(request));
    return;
  }
  if(/\/icons\//.test(url.pathname) || /manifest\.json$/.test(url.pathname)){
    event.respondWith(handleStaticAsset(request));
    return;
  }
  // それ以外の同一オリジンリクエストはService Workerを介さず通常通り取得する（未知のファイルを壊さない）
});
