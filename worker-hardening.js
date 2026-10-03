/**
 * Cloudflare Worker（weather-proxy）の対策サンプル
 * クライアントは  {WORKER_URL}?lat=35.68&lng=139.76  を呼び、WeatherAPIのJSONを受け取ります。
 * 事前設定：Workers の「変数とシークレット」に WEATHER_API_KEY を Secret として登録しておく。
 * ※既存のWorkerに合わせて、必要な部分だけ取り込んでください。
 */
const ALLOWED_ORIGINS = [
  'https://odekakenavi.github.io',          // 本番・テスト（同一オリジン）
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const originOk = ALLOWED_ORIGINS.includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: originOk ? corsHeaders(origin) : {} });
    }
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
    // ブラウザ経由の呼び出しだけ許可（Originなしの直叩きも拒否）
    if (!originOk) return new Response('Forbidden', { status: 403 });

    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    // 数値かつ日本周辺の範囲のみ許可
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < 24 || lat > 46 || lng < 122 || lng > 146) {
      return new Response('Bad Request', { status: 400, headers: corsHeaders(origin) });
    }

    // 座標を小数第2位に丸めてキャッシュ（無料枠の消費とキー濫用の抑制）
    const q = lat.toFixed(2) + ',' + lng.toFixed(2);
    const cacheKey = new Request('https://weather-cache.internal/' + q);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const api = 'https://api.weatherapi.com/v1/forecast.json?key=' + encodeURIComponent(env.WEATHER_API_KEY) +
                  '&q=' + q + '&days=3&aqi=no&alerts=no';
      const upstream = await fetch(api);
      if (!upstream.ok) return new Response('Upstream error', { status: 502, headers: corsHeaders(origin) });
      res = new Response(upstream.body, { status: 200, headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',   // 30分
      }});
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};

/* レート制限：コードではなく Cloudflare ダッシュボード側で設定するのが簡単です。
   Security → WAF → Rate limiting rules で、このWorkerのホスト名に対し
   「同一IPから1分あたり60リクエスト超はブロック」などを設定してください。 */
