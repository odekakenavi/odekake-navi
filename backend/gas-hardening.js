/**
 * みんなのおでかけ GAS 側の入力対策（コピペ用）
 * 使い方：フォーム送信を受けて appendRow する直前に sanitizeSubmission_(data) を通す。
 * 項目名（data.○○）はご自身のGASに合わせて読み替えてください。
 */

// 1) スプレッドシートの数式インジェクション対策
function safeCell_(v, maxLen) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  // 先頭が = + - @ タブ 改行 の場合は数式扱いされるので ' を付けて文字列化
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  return s;
}

// 2) Instagram URL のみ許可（本体側の表示チェックとの二重防御）
function safeInstagramUrl_(u) {
  var s = String(u || '').trim();
  if (!s || s.length > 500) return '';
  var m = s.match(/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.\-\/?=&%]*$/);
  return m ? s : '';
}

// 3) まとめて整形（文字数上限つき）
function sanitizeSubmission_(data) {
  var out = {
    displayName: safeCell_(data.displayName, 30),
    snsUrl:      safeInstagramUrl_(data.snsUrl),
    postUrl:     safeInstagramUrl_(data.postUrl),
    spotName:    safeCell_(data.spotName, 60),
    comment:     safeCell_(data.comment, 200),
    visitDate:   safeCell_(data.visitDate, 20)
  };
  if (!out.displayName || !out.spotName) throw new Error('required');
  // 投稿URLを入れたのに不正な形式だった場合は弾く（空欄はOK）
  if (data.postUrl && !out.postUrl) throw new Error('invalid postUrl');
  if (data.snsUrl && !out.snsUrl) throw new Error('invalid snsUrl');
  return out;
}

// 4) 連投制限（同一パートナーの連続送信を10秒あけさせる簡易版）
function rateLimitOk_(key) {
  var cache = CacheService.getScriptCache();
  if (cache.get('rl:' + key)) return false;
  cache.put('rl:' + key, '1', 10);
  return true;
}

// 5) ハニーポット：フォームに画面外の隠し入力 "website" を置き、値があればbotとして破棄
function isBot_(data) { return !!(data && data.website); }
