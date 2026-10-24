/**
 * みんなのおでかけ GAS 側の入力対策 v2（コピペ用）
 *
 * 使い方：
 *   doPost の中で、シートへ書き込む処理を appendFn(out) として渡すだけです。
 *     function doPost(e) {
 *       return handleSubmission_(parseBody_(e), function (out) {
 *         // ↓ 既存の appendRow をここに移す（out.○○ を使う）
 *         sheet.appendRow([new Date(), out.contributorId, out.displayName, out.snsUrl,
 *                          out.spotName, out.postUrl, out.comment, out.visitDate]);
 *       });
 *     }
 *   項目名（data.○○）・シート名は、ご自身のGASに合わせて読み替えてください。
 */

var CONFIG_ = {
  KEY_COOLDOWN_SEC: 10,          // 同じ投稿者の連続送信の間隔（秒）
  GLOBAL_LIMIT_PER_HOUR: 60,     // 全体の受付上限（1時間あたり）。bot対策の本命
  // 登録済みパートナーIDだけを受け付ける場合は true にする。
  // 先に CONTRIBUTORS_SHEET / CONTRIBUTOR_ID_COL を合わせ、テスト投稿で通ることを確認してから切り替えてください
  CHECK_CONTRIBUTOR: false,
  CONTRIBUTORS_SHEET: 'contributors',  // パートナー一覧のシート名
  CONTRIBUTOR_ID_COL: 1                // ID が入っている列（1 = A列）。1行目は見出しとして読み飛ばす
};

// 公開JSON（サイトが読む側）に出してよい項目。ここに無い項目は外に出ません
var PUBLIC_FIELDS_ = ['contributorId', 'displayName', 'snsUrl', 'spotName', 'postUrl', 'comment', 'visitDate'];

// 1) スプレッドシートの数式インジェクション対策
function safeCell_(v, maxLen) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  // 先頭が = + - @ の場合は数式扱いされるので ' を付けて文字列化
  if (/^[=+\-@]/.test(s)) s = "'" + s;
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
  data = data || {};
  var out = {
    contributorId: safeCell_(data.contributorId, 60),
    displayName:   safeCell_(data.displayName, 30),
    snsUrl:        safeInstagramUrl_(data.snsUrl),
    postUrl:       safeInstagramUrl_(data.postUrl),
    spotName:      safeCell_(data.spotName, 60),
    comment:       safeCell_(data.comment, 200),
    visitDate:     safeCell_(data.visitDate, 20)
  };
  if (!out.displayName || !out.spotName) throw new Error('required');
  // URL を入れたのに不正な形式だった場合は弾く（空欄はOK）
  if (data.postUrl && !out.postUrl) throw new Error('invalid postUrl');
  if (data.snsUrl && !out.snsUrl) throw new Error('invalid snsUrl');
  return out;
}

// 4) 連投制限：投稿者ごとの間隔 ＋ 全体の1時間あたり上限（同時送信対策に LockService を使用）
function rateLimitOk_(key) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    var cache = CacheService.getScriptCache();
    var k = 'rl:' + String(key || 'anon').slice(0, 60);
    if (cache.get(k)) return false;
    var gk = 'rlg:' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH');
    var n = Number(cache.get(gk) || 0);
    if (n >= CONFIG_.GLOBAL_LIMIT_PER_HOUR) return false;
    cache.put(gk, String(n + 1), 3700);
    cache.put(k, '1', CONFIG_.KEY_COOLDOWN_SEC);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// 5) ハニーポット：フォームに画面外の隠し入力 "website" を置き、値があればbotとして破棄
function isBot_(data) { return !!(data && data.website); }

// 6) 登録済みパートナーIDの照合（CONFIG_.CHECK_CONTRIBUTOR が true のときだけ有効）
function isKnownContributor_(id) {
  if (!CONFIG_.CHECK_CONTRIBUTOR) return true;
  id = String(id || '').trim();
  if (!id) return false;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('contrib-ids');
  var ids;
  if (raw) {
    ids = JSON.parse(raw);
  } else {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_.CONTRIBUTORS_SHEET);
    if (!sh) return false;
    var last = sh.getLastRow();
    ids = last >= 2
      ? sh.getRange(2, CONFIG_.CONTRIBUTOR_ID_COL, last - 1, 1).getValues()
          .map(function (r) { return String(r[0]).trim(); })
          .filter(Boolean)
      : [];
    cache.put('contrib-ids', JSON.stringify(ids), 300);   // 5分キャッシュ（新しいパートナーは最大5分で反映）
  }
  return ids.indexOf(id) >= 0;
}

// 7) 受け取り口：エラーの中身は返さない（ログにだけ残す）
function handleSubmission_(data, appendFn) {
  try {
    if (isBot_(data)) return jsonOut_({ ok: true });            // botには「成功」と同じ応答を返して気づかせない
    var out = sanitizeSubmission_(data);
    if (!isKnownContributor_(out.contributorId)) return jsonOut_({ ok: false, error: 'rejected' });
    if (!rateLimitOk_(out.contributorId || out.displayName)) return jsonOut_({ ok: false, error: 'rate_limited' });
    appendFn(out);
    return jsonOut_({ ok: true });
  } catch (err) {
    console.error(String((err && err.stack) || err));           // 詳細は実行ログへ。画面には出さない
    return jsonOut_({ ok: false, error: 'invalid' });
  }
}

// 8) 公開JSONに出す項目を限定（行オブジェクトから PUBLIC_FIELDS_ だけを取り出す）
function pickPublic_(row) {
  var o = {};
  PUBLIC_FIELDS_.forEach(function (f) { if (row && row[f] != null) o[f] = row[f]; });
  return o;
}

function parseBody_(e) {
  try {
    if (e && e.postData && /json/i.test(e.postData.type || '')) return JSON.parse(e.postData.contents);
  } catch (err) { /* 下の e.parameter にフォールバック */ }
  return (e && e.parameter) || {};
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
