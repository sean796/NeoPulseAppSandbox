import { readFileSync } from "node:fs";
const h = readFileSync("b:/Neo Pulse/scripts/_tmp-nd-fact/elementor-vs-divi-live.html", "utf8");
const marker = 'id="pricing-and-licensing-making-the-right-choice"';
const i = h.indexOf(marker);
console.log("idx", i);
console.log(i < 0 ? "missing" : h.slice(i, i + 1800));
console.log("HAS_SENTENCE", /Elementor provides a free version with limited features and several annual/.test(h));
console.log("HAS_FREE_VERSION_LINK", /<a[^>]*>free version<\/a>/.test(h));
console.log("HAS_ANNUAL", /<a[^>]*>annual membership<\/a>/.test(h));
