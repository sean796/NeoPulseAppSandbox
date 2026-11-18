import { describe, expect, it } from "vitest";
import {
  removeNonWikipediaExternalLinks,
  sanitizeContentForUpload,
} from "@/lib/content-generation/content-sanitizer";
import { stampExternalLinksNofollow } from "@/lib/content-generation/sanitizer/link-rules-validate";
import { FACT_SOURCE_ATTR } from "../product-fact-checker";

describe("removeNonWikipediaExternalLinks fact sources", () => {
  it("keeps data-fact-source evidence links that are not the client host", () => {
    const html = `<p>See <a href="https://www.hunterdouglas.com/powerview" ${FACT_SOURCE_ATTR}="1">Hunter Douglas</a> for specs.</p>`;
    const out = removeNonWikipediaExternalLinks(html, "https://blindmagic.com");
    expect(out).toContain("hunterdouglas.com/powerview");
    expect(out).toContain(`${FACT_SOURCE_ATTR}="1"`);
  });

  it("still removes unknown external links without the fact-source marker", () => {
    const html = `<p>See <a href="https://random-blog.example/post">a blog</a>.</p>`;
    const out = removeNonWikipediaExternalLinks(html, "https://blindmagic.com");
    expect(out).not.toContain("random-blog.example");
    expect(out).toContain("a blog");
  });
});

describe("stampExternalLinksNofollow", () => {
  it("adds nofollow to external links and leaves same-site alone", () => {
    const html = [
      `<p><a href="https://blindmagic.com/about">About</a></p>`,
      `<p><a href="https://www.energy.gov/study">Energy study</a></p>`,
      `<p><a href="#section">Jump</a></p>`,
    ].join("");
    const out = stampExternalLinksNofollow(html, "https://blindmagic.com");
    expect(out).toContain('href="https://blindmagic.com/about">About</a>');
    expect(out).not.toMatch(/href="https:\/\/blindmagic\.com\/about"[^>]*nofollow/);
    expect(out).toMatch(
      /href="https:\/\/www\.energy\.gov\/study"[^>]*rel="[^"]*nofollow[^"]*"/,
    );
    expect(out).toContain('href="#section">Jump</a>');
  });
});

describe("sanitizeContentForUpload nofollow", () => {
  it("keeps fact-source links and stamps nofollow on them", () => {
    const html = `<p>PowerView is documented by <a href="https://www.hunterdouglas.com/powerview" ${FACT_SOURCE_ATTR}="1">Hunter Douglas</a>.</p>`;
    const out = sanitizeContentForUpload(html, "https://blindmagic.com");
    expect(out).toContain("hunterdouglas.com/powerview");
    expect(out).toContain(`${FACT_SOURCE_ATTR}="1"`);
    expect(out).toMatch(/rel="[^"]*nofollow[^"]*"/);
  });
});
