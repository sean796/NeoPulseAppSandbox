import { describe, expect, it } from "vitest";
import {
  CHANGELOG_NEWSLETTER_READING_SYSTEM,
  CHANGELOG_NEWSLETTER_WEB_MODEL,
  assembleChangelogNewsletter,
  assertNewsletterArticleSourcesReachable,
  parseChangelogNewsletterReadingDraft,
  stripBannedChangelogTopics,
  type ChangelogNewsletterReadingDraft,
} from "@/lib/changelog/changelog-newsletter-agent";
import {
  NEO_PULSE_BRAND_ACCENT,
  buildChangelogNewsletterEmail,
} from "@/lib/changelog/changelog-newsletter-email";

const READING: ChangelogNewsletterReadingDraft = {
  articles: [
    {
      title: "Why agencies are consolidating client hosting access",
      summary:
        "Industry analysis on why multi-site agencies are moving away from scattered wp-admin logins toward centralized access control. It covers risk from stale admin accounts and how clients expect agencies to own the security posture.",
      date: "Oct 15, 2026",
      sourceUrl: "https://example.com/agency-hosting-access-control",
      whyItHelps: "This is why Pulse shipped Pulse Host site user management this week.",
    },
    {
      title: "Client SEO reports fail when property IDs drift",
      summary:
        "Recent agency reporting piece on how wrong GA4 or Semrush IDs quietly poison month-over-month decks. CEOs care about narrative trust more than which plugin collected the clicks.",
      date: "Sep 22, 2026",
      sourceUrl: "https://example.com/reporting-id-trust",
      whyItHelps: "This is why Pulse shipped Semrush and GA4 ID seeding with server-side client report narratives this week.",
    },
    {
      title: "API key ops is now a marketing-stack risk",
      summary:
        "Coverage of how AI tools inside marketing platforms break when provider keys are missing or stale. Treats key registration as an operations problem for agencies, not a developer footnote.",
      date: "Aug 30, 2026",
      sourceUrl: "https://example.com/ai-api-key-ops-agencies",
      whyItHelps: "This is why Pulse shipped the OpenRouter key field that registers as you type on API Keys this week.",
    },
  ],
};

const ENTRY = {
  title: "Significant Improvements to Pulse Host and Reporting",
  date: "2026-11-13",
  commitCount: 125,
  rangeFrom: "2026-11-01",
  rangeTo: "2026-11-13",
  highlights: [
    "Pulse Host site and user management expanded",
    "Client reports gained server-side narratives",
    "Improved email desk EMCP integration for Rank Math meta updates and triage.",
  ],
  sections: [
    {
      heading: "New",
      items: ["Site user management is now available", "Email desk hub wired to Rank Math siteTasks"],
    },
  ],
  commitSubjects: ["Add Pulse Host user management", "Seed GA4 property IDs"],
};

describe("changelog newsletter reading drafts", () => {
  it("parses reading articles with https sources", () => {
    const draft = parseChangelogNewsletterReadingDraft(JSON.stringify(READING));
    expect(draft.articles).toHaveLength(3);
    expect(draft.articles[0]?.sourceUrl.startsWith("https://")).toBe(true);
    expect(draft).not.toHaveProperty("languages");
    expect(draft).not.toHaveProperty("tips");
  });

  it("rejects http article URLs", () => {
    const bad = {
      articles: [
        { ...READING.articles[0], sourceUrl: "http://insecure.example" },
        READING.articles[1],
        READING.articles[2],
      ],
    };
    expect(() => parseChangelogNewsletterReadingDraft(JSON.stringify(bad))).toThrow(
      /changelog newsletter reading draft/i,
    );
  });

  it("strips Rank Math and EMCP lines from the pack", () => {
    const cleaned = stripBannedChangelogTopics(ENTRY);
    expect(cleaned.highlights.some((h) => /rank math|emcp/i.test(h))).toBe(false);
    expect(cleaned.sections?.[0]?.items.some((i) => /rank math/i.test(i))).toBe(false);
  });

  it("locks reading prompt to CEO why-we-shipped context", () => {
    expect(CHANGELOG_NEWSLETTER_WEB_MODEL).toMatch(/:online|sonar/i);
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("client CEOs");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("web search");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("Banned: WordPress / GA4");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("Never invent URLs");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("client-facing ship item");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("This is why Pulse shipped");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).not.toContain("3 languages");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).not.toContain("Do this week");
  });

  it("fails when an article URL resolves to a domain-for-sale page", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<html><title>domain is for sale | Buy with Epik.com</title></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;
    try {
      await expect(
        assertNewsletterArticleSourcesReachable([
          { title: "Agency hosting access control trends", sourceUrl: "https://example.com/parked" },
        ]),
      ).rejects.toThrow(/not a live matching article/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails when page title does not match the claimed article title", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<html><title>Pulse Web Analytics Case Study | Cameron Low</title></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;
    try {
      await expect(
        assertNewsletterArticleSourcesReachable([
          {
            title: "The Role of API Key Management in Modern Web Platforms",
            sourceUrl: "https://example.com/projects/pulse",
          },
        ]),
      ).rejects.toThrow(/does not match claimed title/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("assembles highlights and articles without tips or languages", () => {
    const payload = assembleChangelogNewsletter(ENTRY, READING);
    expect(payload.articles[0]?.whyItHelps).toContain("This is why Pulse shipped");
    expect(payload.highlights.some((h) => /rank math|emcp/i.test(h))).toBe(false);
    expect(payload).not.toHaveProperty("languages");
    expect(payload).not.toHaveProperty("tips");
  });
});

describe("changelog newsletter email", () => {
  it("keeps Highlights and More you know without Languages, hero, or Do this week", () => {
    const payload = assembleChangelogNewsletter(ENTRY, READING);
    const email = buildChangelogNewsletterEmail(payload);

    expect(email.html).toContain(NEO_PULSE_BRAND_ACCENT);
    expect(email.html).toContain("Highlights");
    expect(email.html).toContain("<ul");
    expect(email.html).toContain("More you know");
    expect(email.html).toContain("Read article");
    expect(email.html).toContain("https://example.com/agency-hosting-access-control");
    expect(email.html).not.toContain("Do this week");
    expect(email.html).not.toContain("Languages");
    expect(email.html).not.toContain("cid:");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("\u2014");

    expect(email.text).toContain("MORE YOU KNOW");
    expect(email.text).toContain("This is why Pulse shipped");
    expect(email.text).not.toContain("DO THIS WEEK");
    expect(email.text).not.toContain("LANGUAGES");
  });
});
