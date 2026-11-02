/* ======================================================================
   おでかけナビ Service Worker
   ----------------------------------------------------------------------
   方針：「古いデータを表示し続けない」ことを最優先にする。
   ・HTML（アプリ本体）／JSON（施設・ホテル・実体験）／JS／CSS／manifest
       → Network First（常にサーバーへ再検証。オフライン・通信が極端に遅い時だけ保存済みを表示）
   ・画像（施設写真・アイコン等）
       → Stale While Revalidate（保存済みをすぐ出しつつ、裏で最新版に更新）
   ・別ドメイン（GA4／Open-Meteo／ValueCommerce／Google Fonts／翻訳 等）
       → 一切さわらない（天気APIなどが古いまま固定されることはない）
   ・GET以外／Rangeリクエスト → さわらない

   GitHub Pages のサブパス（/odekake-navi/ など）で動くよう、パスはすべて
   この Service Worker 自身の scope（self.registration.scope）から組み立てる。
   キャッシュ名にも scope を含めるので、同じドメインの別サイト
   （例：テスト用 /odekakenavi-test/）と保存領域が混ざらない。
   ====================================================================== */
"use strict";

var SW_VERSION = "2026-11-02-1";   // 目印（このファイルを書き換えるとブラウザが新版として検知する）
var SCOPE_URL  = new URL(self.registration.scope);
var SCOPE_PATH = SCOPE_URL.pathname;                 // 例：/odekake-navi/
var PREFIX     = "odekake:" + SCOPE_PATH + ":";
var CACHE_SHELL   = PREFIX + "shell-v1";    // アプリ本体（index.html）
var CACHE_DATA    = PREFIX + "data-v1";     // data/*.json・manifest・JS/CSS
var CACHE_RUNTIME = PREFIX + "runtime-v1";  // experiences/*.json（数が増えるので件数上限あり）
var CACHE_IMG     = PREFIX + "img-v1";      // 画像（件数上限あり）
var CURRENT = [CACHE_SHELL, CACHE_DATA, CACHE_RUNTIME, CACHE_IMG];

var NET_TIMEOUT_MS = 6000;      // 保存済みがある時だけ、この時間を超えたら保存済みを先に表示する
var MAX_RUNTIME_ENTRIES = 60;
var MAX_IMG_ENTRIES = 120;

var SHELL_KEY = SCOPE_URL.href;  // アプリ本体の保存キー（?spot= 等のクエリ違いで増えないよう固定）

/* ---------- install / activate ---------- */
self.addEventListener("install", function(){
  // 待機（waiting）のままにして、ページ側の「更新する」ボタン（SKIP_WAITINGメッセージ）で切り替える。
  // ＝勝手に画面が再読み込みされない。データ／HTMLは常にNetwork Firstなので、切り替えを待つ間も古い内容は出ない。
});

self.addEventListener("activate", function(event){
  event.waitUntil((async function(){
    var keys = await caches.keys();
    await Promise.all(keys.filter(function(k){
      // ① このscopeの古い版のキャッシュ ② 旧Service Workerが作っていた "odekake〜" 系の古いキャッシュ を掃除
      var mine   = k.indexOf(PREFIX) === 0 && CURRENT.indexOf(k) === -1;
      var legacy = /^odekake/i.test(k) && k.indexOf("odekake:") !== 0;
      return mine || legacy;
    }).map(function(k){ return caches.delete(k); }));
    // clients.claim() は呼ばない：初回インストール時にページが勝手に切り替わって再読み込みされるのを防ぐ。
    // （次回の読み込みから自然にService Workerの管理下になる）
  })());
});

self.addEventListener("message", function(event){
  if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* ---------- fetch ---------- */
self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;
  if(req.headers.has("range")) return;
  var url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if(url.origin !== self.location.origin) return;           // 別ドメインは触らない
  if(url.pathname.indexOf(SCOPE_PATH) !== 0) return;         // scope外は触らない

  if(req.mode === "navigate"){
    event.respondWith(handleNavigation(event));
    return;
  }
  if(/\.(?:json|webmanifest|js|mjs|css)$/i.test(url.pathname)){
    var cacheName = url.pathname.indexOf("/experiences/") !== -1 ? CACHE_RUNTIME : CACHE_DATA;
    event.respondWith(networkFirst(event, req, cacheName));
    return;
  }
  if(req.destination === "image" || /\.(?:png|jpe?g|webp|gif|svg|ico|avif)$/i.test(url.pathname)){
    event.respondWith(staleWhileRevalidate(event, req));
    return;
  }
  // それ以外（sitemap.xml等）は何もせず通常どおりネットワークへ
});

/* ---------- helpers ---------- */
function isShellPath(pathname){
  return pathname === SCOPE_PATH || pathname === SCOPE_PATH + "index.html";
}
function dataKey(url){            // クエリ（?v=123 等）違いで増えないよう、パスだけをキーにする
  var u = new URL(url);
  return u.origin + u.pathname;
}
function delay(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

async function trimCache(cacheName, max){
  try{
    var cache = await caches.open(cacheName);
    var keys = await cache.keys();
    for(var i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  }catch(e){}
}

// リダイレクト済みレスポンス（/odekake-navi → /odekake-navi/ 等）はそのままだとナビゲーションに返せないので作り直す
async function cleanResponse(res){
  if(!res.redirected) return res;
  var body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function offlinePage(){
  var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>おでかけナビ（オフライン）</title></head>' +
    '<body style="margin:0;padding:32px 20px;font:15px/1.8 sans-serif;background:#FBF7EF;color:#2B2620;text-align:center">' +
    '<p style="font-size:34px;margin:0">📶</p>' +
    '<h1 style="font-size:18px">インターネットに接続できません</h1>' +
    '<p>通信状況を確認して、もう一度お試しください。</p>' +
    '<p><a href="' + SCOPE_PATH + '" style="color:#3E8FB0;font-weight:700">おでかけナビのトップへ</a></p>' +
    '</body></html>';
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* ---------- ページ移動：Network First（毎回サーバーに再検証。304なら転送量はごくわずか） ---------- */
async function handleNavigation(event){
  var req = event.request;
  var url = new URL(req.url);
  var shell = isShellPath(url.pathname);
  var cache = await caches.open(CACHE_SHELL);
  var cached = shell ? await cache.match(SHELL_KEY) : undefined;

  var net = fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" })).then(function(res){
    if(shell && res.ok) event.waitUntil(cache.put(SHELL_KEY, res.clone()));
    return res;
  });
  var netClean = net.then(cleanResponse);

  // 404（施設ページ等の深いURL）もそのまま返す → 404.html のSPAリダイレクト復元が従来どおり動く
  if(!cached){
    try{ return await netClean; }
    catch(e){ return offlinePage(); }
  }
  event.waitUntil(net.catch(function(){}));
  try{
    return await Promise.race([
      netClean.then(function(res){ return res.status >= 500 ? cached : res; }),
      delay(NET_TIMEOUT_MS).then(function(){ return cached; })
    ]);
  }catch(e){
    return cached;
  }
}

/* ---------- JSON / JS / CSS / manifest：Network First ---------- */
async function networkFirst(event, req, cacheName){
  var key = dataKey(req.url);
  var cache = await caches.open(cacheName);
  var cached = await cache.match(key);
  // ページ側が cache:"no-cache" 等を指定していればそのまま尊重し、指定なしの時は再検証を付ける
  var netReq = req.cache === "default" ? new Request(req, { cache: "no-cache" }) : req;

  var net = fetch(netReq).then(function(res){
    if(res.ok && res.type === "basic"){
      event.waitUntil(cache.put(key, res.clone()).then(function(){
        if(cacheName === CACHE_RUNTIME) return trimCache(cacheName, MAX_RUNTIME_ENTRIES);
      }));
    }
    return res;
  });

  if(!cached) return net;                                    // 保存が無ければ、ネットワークの結果をそのまま返す（失敗も通常どおり）
  event.waitUntil(net.catch(function(){}));
  try{
    return await Promise.race([
      net.then(function(res){ return res.status >= 500 ? cached : res; }),   // 404等は「本当に無い」ので保存済みで隠さない
      delay(NET_TIMEOUT_MS).then(function(){ return cached; })
    ]);
  }catch(e){
    return cached;
  }
}

/* ---------- 画像：Stale While Revalidate ---------- */
async function staleWhileRevalidate(event, req){
  var cache = await caches.open(CACHE_IMG);
  var cached = await cache.match(req.url);
  var net = fetch(req).then(function(res){
    if(res.ok && res.type === "basic"){
      event.waitUntil(cache.put(req.url, res.clone()).then(function(){ return trimCache(CACHE_IMG, MAX_IMG_ENTRIES); }));
    }
    return res;
  });
  if(cached){
    event.waitUntil(net.catch(function(){}));
    return cached;
  }
  return net;
}

/* ---------- 通知（Web Push） ---------- */
/* 受信：本文なしの合図が届いたら、文面を作って表示／タップ：サイトを開く */
var PUSH_API = "https://odekake-push.odekakenavi2026.workers.dev"; // ← デプロイ後のWorkerのURL

/* 「今週末で終わるイベント」は、端末に保存済みの data/spots.json から数える（Worker側は重い処理をしない）。
   イベント終了日の上限（EVENT_UNTIL）は index.html にだけ書く。サイトを開いたときに端末へ保存され、ここで読む。 */
var EV_EMOJI = { "紅葉": "🍁", "ハロウィン": "🎃", "イルミネーション": "✨", "クリスマス": "🎄", "いちご狩り": "🍓", "お花見": "🌸", "GW": "🎏", "水遊び": "💦", "夏祭り・花火": "🎆" };

function evUtcMs(s){ return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
function evYmd(ms){ return new Date(ms).toISOString().slice(0, 10); }

async function loadSpotsForPush(){
  var url = new URL("data/spots.json", self.registration.scope).href;
  try{
    var cache = await caches.open(CACHE_DATA);
    var hit = await cache.match(dataKey(url));
    if(hit) return await hit.json();
  }catch(e){}
  try{   // 保存が無いときだけネットワークから取る（4秒で諦める）
    var res = await Promise.race([fetch(url), delay(4000).then(function(){ throw new Error("timeout"); })]);
    if(res && res.ok) return await res.json();
  }catch(e){}
  return null;
}

/* 上限は「12-25」のように月-日で持つ。そのイベント自身の年に当てはめる（index.html の evCap と同じ考え方。年つきの旧形式もそのまま使える） */
function evCapFor(u, i){
  if(!u) return null;
  if(/^\d{4}-/.test(u)) return u;
  var st = i && i.start, en = i && i.end, y;
  if(st) y = +st.slice(0, 4);
  else if(en){ y = +en.slice(0, 4); if(+en.slice(5, 7) <= 6) y -= 1; }
  else y = +new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 4);   // 手がかりが無ければ「今年」
  return y + "-" + u;
}

async function loadEventUntil(){
  try{
    var cache = await caches.open(CACHE_DATA);
    var hit = await cache.match(dataKey(new URL("_meta/event-until.json", self.registration.scope).href));
    if(hit){ var o = await hit.json(); if(o && typeof o === "object") return o; }
  }catch(e){}
  return {};   // まだ保存されていない（新版を開いていない）ときは上限なし。サイトを開けば自動で入る
}

async function weekendEndingSummary(){
  try{
    var spots = await loadSpotsForPush();
    if(!Array.isArray(spots)) return null;
    var EV_UNTIL = await loadEventUntil();
    var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 日本時間の今日
    var t = evUtcMs(today), dow = new Date(t).getUTCDay();
    var sun = t + ((7 - dow) % 7) * 864e5;                                        // 今週末（土日）の日曜
    var satS = evYmd(sun - 864e5), sunS = evYmd(sun);
    var perKey = {}, total = 0;
    spots.forEach(function(sp){
      if(!sp || sp.operationStatus === "closed" || !sp.events || !sp.eventInfo) return;
      var hit = false;
      sp.events.forEach(function(key){
        var i = sp.eventInfo[key];
        if(!i || i.tentative) return;                     // 日程未定は数えない
        var end = i.end, u = evCapFor(EV_UNTIL[key], i);
        if(u && (!end || end > u)) end = u;
        if(!end || end < today) return;                   // すでに終了
        if(end !== satS && end !== sunS) return;          // 土日に終わるものだけ
        if(i.start && i.start > sunS) return;
        perKey[key] = (perKey[key] || 0) + 1; hit = true;
      });
      if(hit) total++;
    });
    if(!total) return null;
    var tops = Object.keys(perKey).sort(function(a, b){ return perKey[b] - perKey[a]; }).slice(0, 2)
      .map(function(k){ return (EV_EMOJI[k] || "") + k; });
    return { total: total, label: tops.join("・") };
  }catch(e){ return null; }
}

self.addEventListener("push", function (event) {
  event.waitUntil((async function () {
    var latest = fetch(PUSH_API + "/latest", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    var both = await Promise.race([
      Promise.all([latest, weekendEndingSummary()]),
      delay(6000).then(function () { return [{}, null]; })
    ]);
    var d = both[0] || {}, ending = both[1];
    var body = d.body || "今週末のおでかけプランをチェックしましょう";
    var url = d.url || self.registration.scope;
    if (ending) {
      body = "🔥今週末で終わるイベントが" + ending.total + "件" + (ending.label ? "（" + ending.label + "）" : "");
      url += (url.indexOf("?") === -1 ? "?" : "&") + "utm_content=ending";
    }
    // 文面を作れなかった場合でも、必ず通知は表示する（表示しないとブラウザが登録を取り消すことがある）
    await self.registration.showNotification(d.title || "🧭 今週末、どこ行く？", {
      body: body,
      icon: new URL("icon-192.png", self.registration.scope).href,
      tag: "weekly",
      data: { url: url },
    });
  })());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async function () {
    var list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var i = 0; i < list.length; i++) {
      try { await list[i].focus(); if (list[i].navigate) await list[i].navigate(url); return; } catch (e) {}
    }
    await clients.openWindow(url);
  })());
});
