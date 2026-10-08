/* おでかけナビ 共通パーツ（静的ページ用）：右上の🌐翻訳と×、選んだ言語の維持。
   各ページの </body> の直前に <script src="/odekake-navi/site-ui.js" defer></script> を1行入れるだけで使えます。 */
(function(){
if(window.__odekakeSiteUi)return;window.__odekakeSiteUi=true;
var CSSTEXT="\n  header.site{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 12px 6px 18px; min-height:56px; box-sizing:border-box;}\n  .site-tools{display:flex; align-items:center; gap:8px;}\n  .site-btn{display:flex; align-items:center; justify-content:center; width:44px; height:44px; padding:0; border:none; border-radius:50%; background:#F1EADA; color:#2B2620; font-size:16px; line-height:1; cursor:pointer; font-family:inherit; box-shadow:0 1px 4px rgba(43,38,32,.18);}\n  header.site a.site-close{color:#2B2620; font-weight:400; text-decoration:none;}\n  .site-lang-menu{position:fixed; right:8px; top:62px; z-index:1000; min-width:190px; max-width:calc(100vw - 16px); max-height:calc(100vh - 80px); overflow-y:auto; background:#FFFDF8; border:1px solid #E7DFCF; border-radius:12px; box-shadow:0 6px 20px rgba(43,38,32,.22); padding:6px;}\n  .site-lang-menu[hidden]{display:none;}\n  .site-lang-item{display:flex; width:100%; min-height:44px; align-items:center; justify-content:space-between; gap:12px; padding:0 12px; border:0; background:transparent; color:#2B2620; font-size:15px; text-align:left; border-radius:8px; cursor:pointer; font-family:inherit;}\n  .site-lang-item:active{background:#FBF7EF;}\n  .site-lang-item.active{font-weight:700;}\n  .site-toast{position:fixed; left:50%; bottom:24px; transform:translateX(-50%); width:max-content; max-width:92vw; z-index:1001; background:rgba(43,38,32,.94); color:#fff; font-size:13px; line-height:1.6; padding:10px 14px; border-radius:10px;}\n  body{top:0 !important;}\n  body>.skiptranslate,.goog-te-banner-frame,.goog-te-balloon-frame,#goog-gt-tt,.goog-tooltip{display:none !important;}\n  .site-floating{position:fixed; top:8px; right:8px; z-index:999;}\n  .site-floating .site-btn{background:rgba(255,253,248,.96);}\n";
function boot(){
var KEY="odekakeLangV1";
var L=[["ja","日本語"],["en","English"],["ko","한국어"],["zh-CN","简体中文"],["zh-TW","繁體中文"],["vi","Tiếng Việt"],["tl","Filipino"],["ne","नेपाली"],["id","Bahasa Indonesia"],["pt","Português"],["es","Español"],["th","ไทย"]];
var BASE="/odekake-navi/";
var st=document.createElement("style");st.textContent=CSSTEXT;document.head.appendChild(st);
var tools=document.createElement("span");tools.className="site-tools";
var btn=document.createElement("button");btn.type="button";btn.id="siteLangBtn";btn.className="site-btn notranslate";btn.setAttribute("translate","no");btn.setAttribute("aria-label","言語を選ぶ（翻訳）");btn.setAttribute("aria-haspopup","true");btn.setAttribute("aria-expanded","false");btn.textContent="🌐";
var closeBtn=document.createElement("a");closeBtn.id="siteCloseBtn";closeBtn.className="site-btn site-close notranslate";closeBtn.setAttribute("translate","no");closeBtn.href=BASE;closeBtn.setAttribute("aria-label","閉じる（トップへ戻る）");closeBtn.textContent="×";
tools.appendChild(btn);tools.appendChild(closeBtn);
var menu=document.createElement("div");menu.id="siteLangMenu";menu.className="site-lang-menu notranslate";menu.setAttribute("translate","no");menu.hidden=true;
var header=document.querySelector("header.site");
if(header){header.appendChild(tools)}else{var fl=document.createElement("div");fl.className="site-floating";fl.appendChild(tools);document.body.insertBefore(fl,document.body.firstChild)}
document.body.appendChild(menu);
var cur="ja",busy=false,loading=null,toastEl=null,toastT=null;
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}return null}
function isT(){return /translated-(ltr|rtl)/.test(document.documentElement.className||"")}
function fire(el){var ev;try{ev=new Event("change",{bubbles:true})}catch(e){ev=document.createEvent("HTMLEvents");ev.initEvent("change",true,true)}el.dispatchEvent(ev)}
function toast(msg){try{if(!toastEl){toastEl=document.createElement("div");toastEl.className="site-toast notranslate";toastEl.setAttribute("translate","no");toastEl.setAttribute("role","status");document.body.appendChild(toastEl)}toastEl.textContent=msg;toastEl.style.display="block";clearTimeout(toastT);toastT=setTimeout(function(){toastEl.style.display="none"},9000)}catch(e){}}
function clearCookie(){try{var h=location.hostname,p=h.split("."),x="; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";document.cookie="googtrans="+x;document.cookie="googtrans="+x+"; domain="+h;if(p.length>1)document.cookie="googtrans="+x+"; domain=."+p.slice(-2).join(".")}catch(e){}}
function widget(){if(loading)return loading;loading=new Promise(function(res,rej){var t0=Date.now(),done=false,iv=null;function fail(){if(done)return;done=true;clearInterval(iv);loading=null;rej(new Error("load"))}
var h=document.createElement("div");h.id="google_translate_element";h.className="notranslate";h.setAttribute("translate","no");h.style.cssText="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden";document.body.appendChild(h);
window.__siteTInit=function(){try{new window.google.translate.TranslateElement({pageLanguage:"ja",includedLanguages:"en,ko,zh-CN,zh-TW,vi,tl,ne,id,pt,es,th",autoDisplay:false},"google_translate_element")}catch(e){fail()}};
var s=document.createElement("script");s.async=true;s.src="https://translate.google.com/translate_a/element.js?cb=__siteTInit";s.onerror=fail;document.head.appendChild(s);
iv=setInterval(function(){var c=document.querySelector("select.goog-te-combo");if(c){done=true;clearInterval(iv);res(c)}else if(Date.now()-t0>1e4)fail()},200)});return loading}
function to(code){return widget().then(function(){return new Promise(function(res,rej){var t0=Date.now(),last=0,iv=setInterval(function(){var c=document.querySelector("select.goog-te-combo");if(isT()){clearInterval(iv);res();return}if(c&&Date.now()-last>2500){last=Date.now();for(var i=0;i<c.options.length;i++){if(c.options[i].value===code){c.value=code;fire(c);break}}}if(Date.now()-t0>14000){clearInterval(iv);rej(new Error("no-effect"))}},250)})})}
function render(){var h="";for(var i=0;i<L.length;i++){h+='<button type="button" class="site-lang-item notranslate'+(L[i][0]===cur?" active":"")+'" data-lang="'+L[i][0]+'"><span>'+L[i][1]+'</span><span>'+(L[i][0]===cur?"✓":"")+'</span></button>'}menu.innerHTML=h}
function setMenu(open){menu.hidden=!open;btn.setAttribute("aria-expanded",open?"true":"false");if(open)render()}
function select(code){setMenu(false);if(busy||code===cur)return;if(code==="ja"){cur="ja";ls(KEY,null);clearCookie();if(isT())location.reload();return}
busy=true;btn.textContent="…";to(code).then(function(){cur=code;ls(KEY,code)}).catch(function(){toast("この環境では翻訳できませんでした。SafariやChromeで開くと翻訳できる場合があります。")}).then(function(){busy=false;btn.textContent="🌐"})}
btn.addEventListener("click",function(e){e.stopPropagation();setMenu(menu.hidden)});
menu.addEventListener("click",function(e){e.stopPropagation();var t=e.target;while(t&&t!==menu&&!(t.getAttribute&&t.getAttribute("data-lang")))t=t.parentNode;if(t&&t!==menu)select(t.getAttribute("data-lang"))});
document.addEventListener("click",function(){if(!menu.hidden)setMenu(false)});
closeBtn.addEventListener("click",function(e){try{var r=document.referrer;if(r&&r.indexOf(location.origin)===0&&history.length>1){e.preventDefault();history.back()}}catch(err){}});
var saved=ls(KEY);if(saved&&saved!=="ja"){var ok=false;for(var i=0;i<L.length;i++){if(L[i][0]===saved)ok=true}
if(ok){window.addEventListener("load",function(){setTimeout(function(){busy=true;btn.textContent="…";to(saved).then(function(){cur=saved}).catch(function(){ls(KEY,null)}).then(function(){busy=false;btn.textContent="🌐"})},300)})}}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
