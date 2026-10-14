// 公式URLの総点検: 死んでいる/別サイトへ転送/スパム化/施設名が見当たらないURLを洗い出す
// 使い方: node tools/check-urls.js  → url-check-report.md / url-check-report.json を出力
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.env.SPOTS || "data/spots.json", "utf8"));
const spots = Array.isArray(data) ? data : data.spots;
const SPAM = /(オンラインカジノ|カジノ|スロット|ブックメーカー|賭け|パチンコ|バカラ|casino|slot|betting|togel|gacor|judi|สล็อต|พนัน|เดิมพัน|บาคาร่า)/i;
const norm = (s) => String(s).replace(/[\s　・（）()\[\]【】\-－ー~〜]/g, "");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
async function check(spot) {
  const url = spot.officialUrl;
  const r = { name: spot.name, url, status: null, finalUrl: url, flags: [], title: "" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; odekake-navi-linkcheck)", "Accept-Language": "ja" } });
    r.status = res.status; r.finalUrl = res.url;
    const body = (await res.text()).slice(0, 400000);
    const m = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    r.title = m ? m[1].replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (res.status >= 400) r.flags.push("HTTPエラー" + res.status);
    if (host(res.url) !== host(url)) r.flags.push("別ドメインへ転送");
    if (SPAM.test(body)) r.flags.push("スパム語を検出");
    const text = norm(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " "));
    const key = norm(spot.name).slice(0, 4);
    if (res.status < 400 && key.length >= 3 && !text.includes(key)) r.flags.push("施設名が見当たらない(要目視)");
  } catch (e) {
    r.flags.push("接続失敗:" + (e.cause && e.cause.code || e.name));
  } finally { clearTimeout(timer); }
  return r;
}
(async () => {
  const targets = spots.filter((s) => s.officialUrl);
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < targets.length) { const s = targets[i++]; out.push(await check(s)); }
  }));
  const bad = out.filter((r) => r.flags.length);
  fs.writeFileSync("url-check-report.json", JSON.stringify(out, null, 2));
  const lines = [`# 公式URL点検レポート`, ``, `対象 ${out.length} 件 / 要確認 ${bad.length} 件`, ``,
    `| 施設 | URL | 状態 | 注意 | タイトル |`, `|---|---|---|---|---|`,
    ...bad.sort((a, b) => b.flags.length - a.flags.length).map((r) =>
      `| ${r.name} | ${r.url}${r.finalUrl !== r.url ? " → " + r.finalUrl : ""} | ${r.status ?? "-"} | ${r.flags.join("、")} | ${r.title} |`)];
  fs.writeFileSync("url-check-report.md", lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  console.log(`checked ${out.length}, flagged ${bad.length}`);
})();
