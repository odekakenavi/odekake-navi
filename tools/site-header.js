// おでかけナビ 共通ヘッダー（アプリ本体 index.html のヘッダーに合わせた、静的ページ用のもの）
//   ロゴ画像＋左に☰メニュー＋右に×（トップへ戻る）＋🔗共有。メニューの中身は静的ページへの普通のリンク。
//   build-static-pages / build-area-pages / build-event-pages / build-holiday-pages / build-feature-pages が共通で使う。
//   ヘッダーを直すときはこのファイルだけ直せばよい。
'use strict';
const BASE = '/odekake-navi/';
const SITE_HEADER_CSS = String.raw`
  body{padding-top:calc(56px + env(safe-area-inset-top));}
  header.site.sd-header{position:fixed; top:0; left:0; right:0; z-index:100; height:calc(56px + env(safe-area-inset-top)); padding:0; background:linear-gradient(90deg,#bee4fb 40%,#f9e4a7 60%); border-bottom:1px solid #eadfca; overflow:hidden;}
  @media(min-width:768px){header.site.sd-header{background:linear-gradient(90deg,#bee4fb calc(50% - 159px),#f9e4a7 calc(50% + 159px));}}
  .sd-banner{position:absolute; top:env(safe-area-inset-top); left:50%; transform:translateX(-50%); height:56px; width:auto; max-width:none; object-fit:contain; display:block;}
  .sd-btn{position:absolute; top:calc(env(safe-area-inset-top) + 12px); z-index:2; width:32px; height:32px; padding:0; box-sizing:border-box; display:flex; align-items:center; justify-content:center; border:1px solid #eadfca; border-radius:8px; background:#fff; color:#2B2620; font-size:15px; line-height:1; cursor:pointer; text-decoration:none; font-weight:400; box-shadow:0 1px 4px rgba(43,38,32,.18);}
  .sd-btn::after{content:""; position:absolute; inset:-6px;}
  header.site.sd-header a.sd-btn{color:#2B2620; font-weight:400;}
  #sdBtn{left:10px;}
  #sdTop{right:44px; font-size:18px;}
  #sdShare{right:6px;}
  .sd-overlay{position:fixed; inset:0; background:rgba(43,38,32,.45); z-index:300; opacity:0; pointer-events:none; transition:opacity .2s;}
  .sd-overlay.open{opacity:1; pointer-events:auto;}
  .sd-panel{position:fixed; top:0; left:0; bottom:0; width:82%; max-width:340px; background:#FBF7EF; z-index:301; box-shadow:2px 0 16px rgba(0,0,0,.18); transform:translateX(-100%); visibility:hidden; transition:transform .25s ease,visibility 0s linear .25s; overflow-y:auto; padding:16px 0 40px;}
  .sd-panel.open{transform:translateX(0); visibility:visible; transition:transform .25s ease,visibility 0s;}
  .sd-head{display:flex; align-items:center; justify-content:space-between; padding:4px 16px 14px; border-bottom:1px solid #eadfca;}
  .sd-title{font-size:17px; font-weight:900; color:#2B2620;}
  .sd-close{border:none; background:#F1EADA; font-size:16px; cursor:pointer; color:#2B2620; min-width:44px; min-height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center;}
  .sd-home{display:block; padding:14px 16px; font-size:14px; font-weight:800; color:#2B2620; text-decoration:none;}
  .sd-acc{border-top:1px solid #eadfca;}
  .sd-acc>summary{list-style:none; display:flex; align-items:center; justify-content:space-between; min-height:48px; padding:0 16px; font-size:13.5px; font-weight:800; color:#2B2620; cursor:pointer;}
  .sd-acc>summary::-webkit-details-marker{display:none;}
  .sd-acc>summary::after{content:"›"; color:#928a7c; font-size:18px; transition:transform .15s;}
  .sd-acc[open]>summary::after{transform:rotate(90deg);}
  .sd-grid{display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:2px 16px 14px;}
  .sd-btn:hover,.sd-panel a:hover{text-decoration:none;}
  .sd-grid a{display:block; padding:9px 10px; background:#fff; border:1px solid #eadfca; border-radius:8px; font-size:12.5px; font-weight:600; color:#2B2620; text-decoration:none; line-height:1.4;}
`;
// イベントの並び順：アプリのハンバーガーメニューと同じ（1月ごろのイベントから、季節順）。
// 特集ページのイベント切り替えチップとメニューの両方がこの順番を使う。イベントを増やすときはここに足す。
const EVENT_NAV = [
  ['ichigo-gari', '🍓 いちご狩り'], ['ohanami', '🌸 お花見'], ['gw', '🎏 GW・こどもの日'], ['mizuasobi', '💦 水遊び'],
  ['natsumatsuri-hanabi', '🎆 夏祭り・花火'], ['momiji', '🍁 紅葉・いちょう'], ['halloween', '🎃 ハロウィン'],
  ['christmas', '🎄 クリスマス'], ['illumination', '✨ イルミネーション'], ['fuyuyasumi', '🎍 年末年始・冬休み'],
];
const SITE_HEADER_LINKS = [
  ['📍 都道府県から探す', [['東京都', 'tokyo/'], ['神奈川県', 'kanagawa/'], ['埼玉県', 'saitama/'], ['千葉県', 'chiba/'], ['茨城県', 'ibaraki/'], ['栃木県', 'tochigi/'], ['群馬県', 'gunma/'], ['山梨県', 'yamanashi/'], ['静岡県', 'shizuoka/'], ['長野県', 'nagano/'], ['福島県', 'fukushima/']]],
  ['🗺️ エリア特集', [['横浜市', 'kanagawa/yokohama/'], ['湘南エリア', 'kanagawa/shonan/'], ['箱根・小田原', 'kanagawa/hakone-odawara/'], ['横須賀・三浦', 'kanagawa/yokosuka-miura/'], ['東京ベイ', 'tokyo/tokyo-bay/'], ['多摩・八王子', 'tokyo/tama-area/'], ['浦安・幕張・船橋', 'chiba/urayasu-makuhari/'], ['房総', 'chiba/boso/'], ['川越・所沢・飯能', 'saitama/kawagoe-tokorozawa-hanno/'], ['秩父・長瀞', 'saitama/chichibu-nagatoro/'], ['つくば・土浦', 'ibaraki/tsukuba-tsuchiura/'], ['水戸・大洗・日立', 'ibaraki/mito-oarai/'], ['那須・塩原', 'tochigi/nasu-shiobara/'], ['みなかみ・草津', 'gunma/minakami-kusatsu/'], ['軽井沢・佐久', 'nagano/karuizawa-saku/'], ['富士山麓', 'yamanashi/fuji-sanroku/'], ['伊豆・熱海', 'shizuoka/izu/']]],
  ['🎯 目的から探す', [['🐼 動物園', 'purpose/zoo/'], ['🐮 牧場', 'purpose/ranch/'], ['🐠 水族館', 'purpose/aquarium/'], ['🔬 博物館・科学館', 'purpose/museum/'], ['🎡 遊園地', 'purpose/amusement/'], ['🌳 公園', 'purpose/park/'], ['♨️ 温泉', 'purpose/onsen/'], ['🧸 室内遊び場', 'purpose/indoor/'], ['🏊 プール・海', 'purpose/pool/'], ['🌲 アスレチック', 'purpose/athletic/'], ['🍓 果物狩り', 'purpose/fruit-picking/'], ['🎨 ものづくり', 'purpose/craft/'], ['🌼 花の名所', 'purpose/flower/'], ['🏭 工場見学', 'purpose/factory/'], ['⛄ 雪・スケート', 'purpose/snow/'], ['📍 その他', 'purpose/other/']]],
  ['🌸 季節・条件から探す', [['🌸 春', 'season/spring/'], ['☀️ 夏', 'season/summer/'], ['🍁 秋', 'season/autumn/'], ['❄️ 冬', 'season/winter/'], ['☔ 雨の日', 'rainy-day/'], ['💰 無料スポット', 'free/'], ['👶 赤ちゃん向け', 'baby/']]],
  ['🎃 イベントから探す', EVENT_NAV.map(([slug, label]) => [label, 'event/' + slug + '/'])],
];
const SITE_HEADER = `<header class="site sd-header">
  <img class="sd-banner" src="${BASE}img/header.webp" alt="おでかけナビ 今日は、子どもとどこ行く？">
  <button id="sdBtn" class="sd-btn" type="button" aria-label="メニューを開く" aria-expanded="false" aria-controls="sdPanel">☰</button>
  <a id="sdTop" class="sd-btn" href="${BASE}" aria-label="閉じてトップページへ戻る" title="トップページへ戻る">×</a>
  <button id="sdShare" class="sd-btn" type="button" aria-label="URLを共有する" title="URLを共有する">🔗</button>
</header>
<div class="sd-overlay" id="sdOverlay"></div>
<nav class="sd-panel" id="sdPanel" aria-label="サイトメニュー">
  <div class="sd-head"><span class="sd-title">🧭 メニュー</span><button class="sd-close" id="sdClose" type="button" aria-label="メニューを閉じる">×</button></div>
  <a class="sd-home" href="${BASE}">🏠 おでかけナビ トップ（検索・絞り込み）</a>
  ${SITE_HEADER_LINKS.map(([t, ls]) => `<details class="sd-acc"><summary>${t}</summary><div class="sd-grid">${ls.map(([l, h]) => `<a href="${BASE}${h}">${l}</a>`).join('')}</div></details>`).join('\n  ')}
</nav>
<script>(function(){var d=document,p=d.getElementById('sdPanel'),o=d.getElementById('sdOverlay'),b=d.getElementById('sdBtn');function set(v){p.classList.toggle('open',v);o.classList.toggle('open',v);b.setAttribute('aria-expanded',v?'true':'false');}b.onclick=function(){set(!p.classList.contains('open'));};o.onclick=d.getElementById('sdClose').onclick=function(){set(false);};d.addEventListener('keydown',function(e){if(e.key==='Escape')set(false);});d.getElementById('sdShare').onclick=function(){var u=location.href;if(navigator.share){navigator.share({url:u}).catch(function(){});}else if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){alert('URLをコピーしました');},function(){});}};})();</script>
`;
module.exports = { SITE_HEADER_CSS, SITE_HEADER_LINKS, SITE_HEADER, EVENT_NAV };
