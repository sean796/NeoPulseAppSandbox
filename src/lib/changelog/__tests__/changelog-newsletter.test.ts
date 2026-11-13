import { describe, expect, it } from "vitest";
import {
  CHANGELOG_NEWSLETTER_FULL_URL,
  CHANGELOG_NEWSLETTER_INTRO_SYSTEM,
  CHANGELOG_NEWSLETTER_NEWS_PICK_SYSTEM,
  CHANGELOG_NEWSLETTER_READING_SYSTEM,
  CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_WEB_MODEL,
  assembleChangelogNewsletter,
  assertNewsletterArticleSourcesReachable,
  buildChangelogNewsletterReadingUserPrompt,
  parseChangelogNewsletterIntroDraft,
  parseChangelogNewsletterReadingDraft,
  stripBannedChangelogTopics,
  type ChangelogNewsletterIntroDraft,
  type ChangelogNewsletterReadingDraft,
} from "@/lib/changelog/changelog-newsletter-agent";
import {
  CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER,
  NEO_PULSE_BRAND_ACCENT,
  NEO_PULSE_NEWSLETTER_TEXT,
  buildChangelogNewsletterEmail,
  buildChangelogNewsletterSubject,
} from "@/lib/changelog/changelog-newsletter-email";

const INTRO: ChangelogNewsletterIntroDraft = {
  hook: "AgentMail ships the changelog.",
  body: "Pulse now ships a tighter AgentMail newsletter and a cleaner Integrations add-client dock, so the weekly update actually feels readable and onboarding a client takes fewer detours.",
  highlights: [
    "AgentMail now ships the changelog newsletter on a clean, intentional send path.",
    "Email trims to Highlights and why-we-shipped reads. Skim first, deep-dive later.",
    "Integrations gets an add-client dock that does not make you dig for the 'new client' button.",
    "AI import client wiring lands in the WordPress feature for faster property setup.",
    "Settings studio flatten keeps live, origin, and app-sandbox on the same page.",
    "Property dashboard cleanup so client properties feel less like a scavenger hunt.",
  ],
};

const READING: ChangelogNewsletterReadingDraft = {
  articles: [
    {
      title: "Nvidia earnings spotlight the next wave of AI infrastructure spend",
      summary:
        "Fresh coverage of Nvidia's latest results and what they signal for AI compute demand across enterprise software stacks.",
      date: "Nov 12, 2026",
      sourceUrl: "https://example.com/nvidia-ai-infrastructure-news",
      whyItHelps: "Worth knowing if your clients are asking where AI budgets actually go.",
    },
    {
      title: "OpenAI product shift keeps agencies rewriting their AI playbooks",
      summary:
        "A major OpenAI update lands and marketers are already adjusting how they brief and ship AI-assisted work.",
      date: "Nov 10, 2026",
      sourceUrl: "https://example.com/openai-agency-playbook-news",
      whyItHelps: "The kind of headline your client Slack will ping about by lunch.",
    },
    {
      title: "Google Search feature change hits local SEO reporting again",
      summary:
        "New reporting on a Google SERP tweak that changes how local visibility gets measured week to week.",
      date: "Nov 8, 2026",
      sourceUrl: "https://example.com/google-local-seo-serp-news",
      whyItHelps: "Directly relevant if you live in client SEO decks.",
    },
  ],
};

const ENTRY = {
  title: "Changelog newsletter via AgentMail and Integrations add-client dock",
  date: "2026-11-13",
  commitCount: 2,
  rangeFrom: "2026-11-13",
  rangeTo: "2026-11-13",
  highlights: [
    "Changelog newsletter now sends through AgentMail.",
    "Newsletter email trimmed to Highlights and why-we-shipped articles.",
    "New add-client dock panel added in Integrations.",
    "AI import client wiring added to the WordPress feature.",
    "Improved email desk EMCP integration for Rank Math meta updates and triage.",
  ],
  sections: [
    {
      heading: "New",
      items: ["Add-client dock", "Email desk hub wired to Rank Math siteTasks"],
    },
  ],
  commitSubjects: ["Ship changelog newsletter via AgentMail", "Ship CEO changelog newsletter"],
};

describe("changelog newsletter drafts", () => {
  it("parses editorial hook/body/highlights and reading articles", () => {
    const intro = parseChangelogNewsletterIntroDraft(JSON.stringify(INTRO));
    expect(intro.hook.length).toBeLessThanOrEqual(48);
    expect(intro.hook.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(intro.highlights.length).toBeGreaterThanOrEqual(5);
    const draft = parseChangelogNewsletterReadingDraft(JSON.stringify(READING));
    expect(draft.articles).toHaveLength(3);
    expect(draft.articles[0]?.sourceUrl.startsWith("https://")).toBe(true);
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

  it("locks prompts to lean layout and confident Morning Brew voice", () => {
    expect(CHANGELOG_NEWSLETTER_WEB_MODEL).toMatch(/:online|sonar/i);
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Morning Brew");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("hook");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Max 8 words");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("email-safe");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("COMPETENT and INTENTIONAL");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("mystery delivery");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("No more mystery delivery route");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Never write Languages");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("1 to 2 sentence");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("CURRENT industry news");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("last 14 days");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("Importance of");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("NVIDIA");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("mystery delivery");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("Never clueless");
    expect(CHANGELOG_NEWSLETTER_NEWS_PICK_SYSTEM).toContain("web search NOW");
    expect(CHANGELOG_NEWSLETTER_FULL_URL).toContain("/changelog");
    const grounded = buildChangelogNewsletterReadingUserPrompt(ENTRY, [
      {
        title: "NVIDIA Announces CEO Transition",
        url: "https://nvidianews.nvidia.com/news/nvidia-announces-ceo-transition",
        date: "Nov 12, 2026",
      },
    ]);
    expect(grounded).toContain("Required live stories");
    expect(grounded).toContain("nvidianews.nvidia.com");
  });

  it("locks More you know to three verified wire-seed https URLs", () => {
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS).toHaveLength(3);
    for (const seed of CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS) {
      expect(seed.url.startsWith("https://")).toBe(true);
      expect(seed.title.length).toBeGreaterThan(0);
    }
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS[0]?.url).toContain("nvidianews.nvidia.com");
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS[1]?.url).toContain("techcrunch.com");
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS[2]?.url).toContain("searchengineland.com");
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

  it("fails send contract when an article URL returns HTTP 404", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;
    try {
      await expect(
        assertNewsletterArticleSourcesReachable([
          {
            title: "Invented Forbes AI Agency Story",
            sourceUrl: "https://www.forbes.com/sites/fake/2026/11/01/invented-story/",
          },
        ]),
      ).rejects.toThrow(/404|hallucinated|not a live matching article/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("assembles hook, body, rewritten highlights, and changelog url", () => {
    const payload = assembleChangelogNewsletter(ENTRY, INTRO, READING);
    expect(payload.hook).toBe(INTRO.hook);
    expect(payload.body).toContain("AgentMail");
    expect(payload.highlights[0]).toContain("AgentMail");
    expect(payload.changelogUrl).toBe(CHANGELOG_NEWSLETTER_FULL_URL);
    expect(payload.articles[0]?.whyItHelps).toContain("AI budgets");
  });
});

describe("changelog newsletter email", () => {
  it("never mid-word truncates a long hook in the subject", () => {
    const payload = assembleChangelogNewsletter(
      ENTRY,
      {
        ...INTRO,
        hook: "AgentMail ships changelog", // short enough for schema; subject helper still word-safe
      },
      READING,
    );
    // Force a long hook past schema by mutating after assemble.
    const long = {
      ...payload,
      hook: "Changelog newsletter now ships through AgentMail and Integrations gets a new dock",
    };
    const subject = buildChangelogNewsletterSubject(long);
    expect(subject.length).toBeLessThanOrEqual(60);
    expect(subject.endsWith(" d")).toBe(false);
    expect(subject).not.toMatch(/new d$/i);
    expect(subject.startsWith("Neo Pulse: ")).toBe(true);
  });

  it("renders lean three-block layout with More you know separation", () => {
    const payload = assembleChangelogNewsletter(ENTRY, INTRO, READING);
    const email = buildChangelogNewsletterEmail(payload);

    expect(email.subject).toBe("Neo Pulse: AgentMail ships the changelog.");
    expect(email.subject.length).toBeLessThanOrEqual(60);
    expect(email.subject).not.toMatch(/\ba new d\b/i);
    expect(email.preheader).toContain("AgentMail");
    expect(email.html).toContain(NEO_PULSE_BRAND_ACCENT);
    expect(email.html).toContain(NEO_PULSE_NEWSLETTER_TEXT);
    expect(email.html).toContain(INTRO.hook);
    expect(email.html).toContain(INTRO.body);
    expect(email.html).toContain("Full changelog →");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_FULL_URL);
    expect(email.html).toContain("Highlights");
    expect(email.html).toContain("More you know");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER);
    expect(email.html).not.toMatch(/agentic|dynamically curated|AI-powered recommendations/i);
    expect(email.html).toContain("padding:40px 0 12px 0");
    expect(email.html).toContain("Read →");
    expect(email.html).not.toContain("Do this week");
    expect(email.html).not.toContain("Languages");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("\u2014");
    // White body + green accents only: no grey-on-dark muted copy.
    expect(email.html).not.toContain("#a1a1aa");
    expect(email.html).not.toContain("#d4d4d8");
    expect(email.html).not.toContain("#71717a");
    expect(email.html).not.toContain("#f4f4f5");
    expect(email.html).not.toContain("#fafafa");

    const fullIdx = email.html.indexOf("Full changelog →");
    const highlightsIdx = email.html.indexOf("Highlights");
    const moreIdx = email.html.indexOf("More you know");
    expect(fullIdx).toBeGreaterThan(-1);
    expect(highlightsIdx).toBeGreaterThan(fullIdx);
    expect(moreIdx).toBeGreaterThan(highlightsIdx);

    expect(email.text).toContain("Full changelog →");
    expect(email.text).toContain(CHANGELOG_NEWSLETTER_FULL_URL);
    expect(email.text).toContain("MORE YOU KNOW");
    expect(email.text).toContain(CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER);
    expect(email.text).not.toContain("DO THIS WEEK");
    expect(email.text).not.toContain("LANGUAGES");
  });
});
