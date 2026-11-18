const urls = [
  "https://intheshadeflorida.com/service-area/hunter-douglas-dealer-north-palm-beach-heights/",
  "https://intheshadeflorida.com/blog/what-are-aura-illuminated-shades/",
  "https://intheshadeflorida.com/service-area/blinds-shades-shutters-near-jensen-beach-florida/",
  "https://intheshadeflorida.com/service-area/window-treatments-blinds-and-shades-near-opa-locka-florida/",
  "https://intheshadeflorida.com/blog/window-blind-repair/",
];

for (const url of urls) {
  const res = await fetch(url, { redirect: "manual" });
  const loc = res.headers.get("location") || "";
  const html = res.status === 200 ? await res.text() : "";
  const meta = html.match(/name="description" content="([^"]+)"/);
  const flags = ["For expert guidance", "Canada", "Mexico", "772-220-4949", "Window Coverings & Interiors"].filter((needle) =>
    html.toLowerCase().includes(needle.toLowerCase()),
  );
  console.log(
    JSON.stringify({
      status: res.status,
      loc,
      flags,
      meta: meta ? meta[1].slice(0, 160) : "",
      aura: url.includes("aura") ? html.toLowerCase().includes("illuminated") : undefined,
    }),
  );
}
