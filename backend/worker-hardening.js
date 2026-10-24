/**
 * Cloudflare Worker（weather-proxy）の対策 v2
 * クライアントは  {WORKER_URL}?lat=35.68&lng=139.76  を呼び、WeatherAPIのJSONを受け取ります。
 *
 * 事前設定
 *  1) Workers の「変数とシークレット」に WEATHER_API_KEY を Secret として登録しておく。
 *  2) （任意・推奨）レート制限。wrangler の設定ファイルに次を追加すると有効になります。
 *     バインディングが無い場合は、制限なしで動きます（既存の動作を壊しません）。
 *
 *       [[ratelimits]]
 *       name = "RATE_LIMITER"
 *       namespace_id = "1001"
 *         [ratelimits.simple]
 *         limit = 30
 *         period = 60
 *
 *     ※ この機能は厳密な数え方ではなく「ゆるいフィルタ」です。ダッシュボードのWAFレート制限は
 *       独自ドメイン（ゾーン）向けで、workers.dev のURLには使えない可能性が高いです。
 *  3) 保険として WeatherAPI 側の使用量アラートを設定してください。
 */
const ALLOWED_ORIGINS = [
  'https://odekakenavi.github.io',          // 本番・テスト・フォーム（同一オリジン）
];

// 座標をこの桁数に丸めてキャッシュ・問い合わせする。
// 1 = 約11km四方（組み合わせが少なく、無料枠を食い尽くされにくい）／2 = 約1km（細かいが濫用されやすい）
const COORD_DECIMALS = 1;
const CACHE_OK_SEC = 1800;     // 成功は30分キャッシュ
const CACHE_FAIL_SEC = 60;     // 上流の失敗は1分だけ覚えておく（連打で上流を叩かない）

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

function plain(status, text, extra) {
  return new Response(text, { status, headers: Object.assign({ 'X-Content-Type-Options': 'nosniff' }, extra || {}) });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const originOk = ALLOWED_ORIGINS.includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: originOk ? corsHeaders(origin) : {} });
    }
    if (request.method !== 'GET') return plain(405, 'Method Not Allowed');
    // ブラウザ経由の他サイトからの呼び出しを防ぐ（※curl等はOriginを偽装できるため、これだけでは防御になりません。下の上限とキャッシュが本体）
    if (!originOk) return plain(403, 'Forbidden');

    // ゆるいレート制限（バインディングがある場合のみ）
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return plain(429, 'Too Many Requests', Object.assign({ 'Retry-After': '60' }, corsHeaders(origin)));
    }

    const url = new URL(request.url);
    const rawLat = url.searchParams.get('lat');
    const rawLng = url.searchParams.get('lng');
    const lat = rawLat === null || rawLat === '' ? NaN : Number(rawLat);
    const lng = rawLng === null || rawLng === '' ? NaN : Number(rawLng);
    // 数値かつ日本周辺の範囲のみ許可
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < 24 || lat > 46 || lng < 122 || lng > 146) {
      return plain(400, 'Bad Request', corsHeaders(origin));
    }

    // 座標を丸めてキャッシュ（無料枠の消費とキー濫用の抑制）
    const q = lat.toFixed(COORD_DECIMALS) + ',' + lng.toFixed(COORD_DECIMALS);
    const cacheKey = new Request('https://weather-cache.internal/' + q);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      let upstream = null;
      try {
        const api = 'https://api.weatherapi.com/v1/forecast.json?key=' + encodeURIComponent(env.WEATHER_API_KEY) +
                    '&q=' + encodeURIComponent(q) + '&days=3&aqi=no&alerts=no';
        upstream = await fetch(api);
      } catch (e) { /* 失敗として扱う */ }

      if (!upstream || !upstream.ok) {
        // 失敗も短時間だけキャッシュして、同じ座標への連打が上流に届かないようにする
        const fail = new Response('Upstream error', { status: 502, headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=' + CACHE_FAIL_SEC,
        }});
        ctx.waitUntil(cache.put(cacheKey, fail.clone()));
        return plain(502, 'Upstream error', corsHeaders(origin));
      }
      res = new Response(upstream.body, { status: 200, headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=' + CACHE_OK_SEC,
      }});
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    } else if (res.status !== 200) {
      // キャッシュされていた失敗応答
      return plain(502, 'Upstream error', corsHeaders(origin));
    }
    const out = new Response(res.body, res);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
