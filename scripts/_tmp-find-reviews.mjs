const h = await fetch("https://www.alanranger.com/academy/online-photography-course", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

for (const p of ["elfsight", "trustindex", "google-reviews", "reviews-widget", "embedsocial", "grw-", "ti-widget", "4.9", "google.com/maps"]) {
  if (h.toLowerCase().includes(p)) console.log("found", p);
}

const scripts = [...h.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).filter((s) => /review|google|trust|embed/i.test(s));
console.log("review scripts", scripts.slice(0, 10));

const blocks = [...h.matchAll(/<div[^>]+id=["']([^"']*review[^"']*)["'][^>]*>/gi)].map((m) => m[0].slice(0, 120));
console.log("review divs", blocks.slice(0, 5));
