import { describe, expect, it } from "vitest";
import {
  CHANGELOG_NEWSLETTER_AISEO_SYSTEM,
  CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_FULL_URL,
  CHANGELOG_NEWSLETTER_GOOGLE_SYSTEM,
  CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_INDUSTRY_SYSTEM,
  CHANGELOG_NEWSLETTER_INTRO_SYSTEM,
  CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_READING_SYSTEM,
  CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_WEB_MODEL,
  assembleChangelogNewsletter,
  assertNewsletterArticleSourcesReachable,
  buildChangelogNewsletterAiseoUserPrompt,
  buildChangelogNewsletterGoogleUserPrompt,
  buildChangelogNewsletterIndustryUserPrompt,
  buildChangelogNewsletterReadingUserPrompt,
  parseChangelogNewsletterAiseoDraft,
  parseChangelogNewsletterGoogleDraft,
  parseChangelogNewsletterIndustryDraft,
  parseChangelogNewsletterIntroDraft,
  parseChangelogNewsletterReadingDraft,
  stripBannedChangelogTopics,
  type ChangelogNewsletterAiseoDraft,
  type ChangelogNewsletterGoogleDraft,
  type ChangelogNewsletterIndustryDraft,
  type ChangelogNewsletterIntroDraft,
  type ChangelogNewsletterReadingDraft,
} from "@/lib/changelog/changelog-newsletter-agent";
import {
  CHANGELOG_NEWSLETTER_AISEO_NEWS_EXPLAINER,
  CHANGELOG_NEWSLETTER_GOOGLE_UPDATES_EXPLAINER,
  CHANGELOG_NEWSLETTER_INDUSTRY_NEWS_EXPLAINER,
  CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER,
  CHANGELOG_NEWSLETTER_WEEKLY_HIGHLIGHTS_EXPLAINER,
  NEO_PULSE_BRAND_ACCENT,
  NEO_PULSE_NEWSLETTER_MAX_WIDTH,
  NEO_PULSE_NEWSLETTER_TEXT,
  buildChangelogNewsletterEmail,
  buildChangelogNewsletterSubject,
} from "@/lib/changelog/changelog-newsletter-email";

const INTRO: ChangelogNewsletterIntroDraft = {
  hook: "Client reports look finished.",
  body: "Weekly client reports now show the full story without missing sections, and adding a new client takes fewer clicks. The update is about clearer client work, not quieter engineering chores.",
  highlights: [
    "Client PDFs finally show every section expanded so nothing looks half-built.",
    "Local map scans land as a clean circle of pins you can actually brief a client on.",
    "The changelog screen now has a real home for what shipped this week.",
    "Weekly update email ships through a cleaner send path you can trust.",
    "Deep links open the right screen instead of dumping you on Dashboard.",
  ],
};

const READING: ChangelogNewsletterReadingDraft = {
  articles: [
    {
      title: "Why agencies are rebuilding client reporting packs",
      summary:
        "Fresh coverage of how marketing teams are tightening report trust so clients stop asking what is missing from the deck.",
      date: "Nov 11, 2026",
      sourceUrl: "https://example.com/agency-client-reporting-trust",
      whyItHelps: "This is the exact pain Pulse just cleaned up in client report PDFs.",
    },
    {
      title: "Local SEO grids still decide who wins the map pack",
      summary:
        "New analysis on why dense local scans matter when clients ask how visible they are around town.",
      date: "Nov 10, 2026",
      sourceUrl: "https://example.com/local-seo-grid-visibility",
      whyItHelps: "Ties straight to the denser local scan Pulse just shipped.",
    },
    {
      title: "Internal changelogs are becoming a client trust tool",
      summary:
        "Operators are publishing clearer ship notes so leadership can see progress without reading tickets.",
      date: "Nov 9, 2026",
      sourceUrl: "https://example.com/internal-changelog-trust",
      whyItHelps: "Same reason Pulse now has a dedicated changelog home.",
    },
  ],
};

const AISEO: ChangelogNewsletterAiseoDraft = {
  articles: [
    {
      title: "Google publishes generative AI optimization guidance",
      summary:
        "Search Central explains how AI Overviews still lean on crawlable, people-first pages and retrieval from the Search index.",
      date: "Nov 12, 2026",
      sourceUrl: "https://example.com/aiseo-google-guide",
      whyItHelps: "Useful when clients ask what AISEO actually means this quarter.",
    },
    {
      title: "AI Overview citation icons move to the bottom",
      summary:
        "Google is testing source icons at the bottom of AI Overviews, which can hide citations and cut referral clicks.",
      date: "Nov 11, 2026",
      sourceUrl: "https://example.com/aiseo-citation-icons",
      whyItHelps: "Brief clients before they panic about vanishing AI Overview traffic.",
    },
    {
      title: "AI visibility metrics are not the whole scoreboard",
      summary:
        "New industry take on why citation share of voice can distract from pipeline and revenue outcomes.",
      date: "Nov 12, 2026",
      sourceUrl: "https://example.com/aiseo-visibility-metrics",
      whyItHelps: "Keeps AISEO reporting honest for agency owners.",
    },
  ],
};

const GOOGLE: ChangelogNewsletterGoogleDraft = {
  articles: [
    {
      title: "November 2026 Google core update is rolling",
      summary:
        "Google started the November 2026 core update with a two-week rollout window across languages.",
      date: "Nov 10, 2026",
      sourceUrl: "https://example.com/google-core-update",
      whyItHelps: "First thing to check when a client Slack says rankings moved overnight.",
    },
    {
      title: "Search Console Generative AI report had a logging bug",
      summary:
        "Google confirmed impression dips Nov 9 to 11 were a logging error, not real AI Mode performance loss.",
      date: "Nov 12, 2026",
      sourceUrl: "https://example.com/google-gsc-bug",
      whyItHelps: "Stops a bad client report before it leaves the building.",
    },
    {
      title: "November webmaster report covers spam and AI Overviews",
      summary:
        "Weekly Google search wrap includes spam update wrap-up, AI Overview notes, and local Search bits.",
      date: "Nov 12, 2026",
      sourceUrl: "https://example.com/google-webmaster-report",
      whyItHelps: "A fast skim before Friday client status calls.",
    },
  ],
};

const INDUSTRY: ChangelogNewsletterIndustryDraft = {
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
      title: "Anthropic launches Claude Meetings for workplace plans",
      summary:
        "Claude can turn meeting chatter into tasks, which is the kind of AI ops story agencies trade over coffee.",
      date: "Nov 10, 2026",
      sourceUrl: "https://example.com/anthropic-claude-meetings-news",
      whyItHelps: "Fun industry noise that is not another core-update recap.",
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
  it("parses editorial hook/body/highlights and all article drafts", () => {
    const intro = parseChangelogNewsletterIntroDraft(JSON.stringify(INTRO));
    expect(intro.hook.length).toBeLessThanOrEqual(48);
    expect(intro.hook.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(intro.highlights.length).toBeGreaterThanOrEqual(3);
    expect(intro.highlights.length).toBeLessThanOrEqual(5);
    const draft = parseChangelogNewsletterReadingDraft(JSON.stringify(READING));
    expect(draft.articles).toHaveLength(3);
    expect(draft.articles[0]?.sourceUrl.startsWith("https://")).toBe(true);
    expect(parseChangelogNewsletterAiseoDraft(JSON.stringify(AISEO)).articles).toHaveLength(3);
    expect(parseChangelogNewsletterGoogleDraft(JSON.stringify(GOOGLE)).articles).toHaveLength(3);
    const industry = parseChangelogNewsletterIndustryDraft(JSON.stringify(INDUSTRY));
    expect(industry.articles).toHaveLength(3);
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

  it("locks prompts to plain-English body and dedicated news sections", () => {
    expect(CHANGELOG_NEWSLETTER_WEB_MODEL).toMatch(/:online|sonar/i);
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("does NOT write code");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("PULSE's point of view");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("client-owned");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Banned jargon");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Never list technical changes");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Morning Brew");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Max 8 words");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("AISEO News");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Google Updates");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("PRODUCT wins");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("Ban:");
    expect(CHANGELOG_NEWSLETTER_INTRO_SYSTEM).toContain("AgentMail");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("WHY this Pulse ship matters");
    expect(CHANGELOG_NEWSLETTER_READING_SYSTEM).toContain("required https URLs");
    expect(CHANGELOG_NEWSLETTER_AISEO_SYSTEM).toContain("AISEO News");
    expect(CHANGELOG_NEWSLETTER_AISEO_SYSTEM).toContain("GEO");
    expect(CHANGELOG_NEWSLETTER_GOOGLE_SYSTEM).toContain("Google Updates");
    expect(CHANGELOG_NEWSLETTER_GOOGLE_SYSTEM).toContain("core updates");
    expect(CHANGELOG_NEWSLETTER_INDUSTRY_SYSTEM).toContain("Industry News");
    expect(CHANGELOG_NEWSLETTER_INDUSTRY_SYSTEM).toContain("fun");
    expect(CHANGELOG_NEWSLETTER_FULL_URL).toContain("/changelog");
    const pulsePrompt = buildChangelogNewsletterReadingUserPrompt(
      ENTRY,
      CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS,
    );
    expect(pulsePrompt).toContain("Required live More you know");
    expect(pulsePrompt).toContain("seo-report-client-wrong");
    expect(buildChangelogNewsletterAiseoUserPrompt(CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS)).toContain(
      "Required live AISEO News",
    );
    expect(
      buildChangelogNewsletterGoogleUserPrompt(CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS),
    ).toContain("Required live Google Updates");
    const industryPrompt = buildChangelogNewsletterIndustryUserPrompt(
      CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS,
    );
    expect(industryPrompt).toContain("Required live Industry News");
    expect(industryPrompt).toContain("nvidianews.nvidia.com");
  });

  it("locks all news sections to verified wire-seed https URLs", () => {
    expect(CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS).toHaveLength(3);
    expect(CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS).toHaveLength(3);
    expect(CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS).toHaveLength(3);
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS).toHaveLength(3);
    for (const seed of [
      ...CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS,
      ...CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS,
      ...CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS,
      ...CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS,
    ]) {
      expect(seed.url.startsWith("https://")).toBe(true);
      expect(seed.title.length).toBeGreaterThan(0);
    }
    expect(CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS[0]?.url).toContain("seo-report-client-wrong");
    expect(CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS[0]?.url).toContain("ai-optimization-guide");
    expect(CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS[0]?.url).toContain("core-update-rolling-out");
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS[0]?.url).toContain("nvidianews.nvidia.com");
    expect(CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS[2]?.url).toContain("techcrunch.com");
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
      ).rejects.toThrow(/not a live matching/i);
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
      ).rejects.toThrow(/404|hallucinated|not a live matching/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("assembles hook, body, Pulse, AISEO, Google, and industry articles", () => {
    const payload = assembleChangelogNewsletter(ENTRY, INTRO, READING, AISEO, GOOGLE, INDUSTRY);
    expect(payload.hook).toBe(INTRO.hook);
    expect(payload.body).toContain("client");
    expect(payload.highlights[0]).toContain("PDFs");
    expect(payload.changelogUrl).toBe(CHANGELOG_NEWSLETTER_FULL_URL);
    expect(payload.articles[0]?.whyItHelps).toContain("Pulse");
    expect(payload.aiseoArticles[0]?.whyItHelps).toContain("AISEO");
    expect(payload.googleArticles[0]?.whyItHelps).toContain("rankings");
    expect(payload.industryArticles[0]?.whyItHelps).toContain("AI budgets");
  });
});

describe("changelog newsletter email", () => {
  it("never mid-word truncates a long hook in the subject", () => {
    const payload = assembleChangelogNewsletter(
      ENTRY,
      {
        ...INTRO,
        hook: "Client reports look finished",
      },
      READING,
      AISEO,
      GOOGLE,
      INDUSTRY,
    );
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

  it("renders full-width framed sections with white/green only", () => {
    const payload = assembleChangelogNewsletter(ENTRY, INTRO, READING, AISEO, GOOGLE, INDUSTRY);
    const email = buildChangelogNewsletterEmail(payload);

    expect(email.subject).toBe("Neo Pulse: Client reports look finished.");
    expect(email.subject.length).toBeLessThanOrEqual(60);
    expect(email.preheader).toContain("client");
    expect(email.html).toContain(NEO_PULSE_BRAND_ACCENT);
    expect(email.html).toContain(NEO_PULSE_NEWSLETTER_TEXT);
    expect(email.html).toContain(`max-width:${NEO_PULSE_NEWSLETTER_MAX_WIDTH}px`);
    expect(email.html).toContain(`width="${NEO_PULSE_NEWSLETTER_MAX_WIDTH}"`);
    expect(email.html).not.toContain("width:600px");
    expect(email.html).not.toContain('width="600"');
    expect(email.html).toContain("width:4px;background-color:#84bd00");
    expect(email.html).toContain(INTRO.hook);
    expect(email.html).toContain(INTRO.body);
    expect(email.html).toContain("Full changelog →");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_FULL_URL);
    expect(email.html).toContain("This week ·");
    expect(email.html).toContain("Weekly highlights");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_WEEKLY_HIGHLIGHTS_EXPLAINER);
    expect(email.html).toContain("More you know");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER);
    expect(email.html).toContain("AISEO News");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_AISEO_NEWS_EXPLAINER);
    expect(email.html).toContain("Google Updates");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_GOOGLE_UPDATES_EXPLAINER);
    expect(email.html).toContain("Industry News");
    expect(email.html).toContain(CHANGELOG_NEWSLETTER_INDUSTRY_NEWS_EXPLAINER);
    expect(email.html).toContain("Read →");
    expect(email.html).not.toContain("Do this week");
    expect(email.html).not.toContain("Languages");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("\u2014");
    expect(email.html).not.toContain("#a1a1aa");
    expect(email.html).not.toContain("#d4d4d8");
    expect(email.html).not.toContain("#71717a");
    expect(email.html).not.toContain("#f4f4f5");
    expect(email.html).not.toContain("#fafafa");

    const moreIdx = email.html.indexOf("More you know");
    const aiseoIdx = email.html.indexOf("AISEO News");
    const googleIdx = email.html.indexOf("Google Updates");
    const industryIdx = email.html.indexOf("Industry News");
    expect(moreIdx).toBeGreaterThan(-1);
    expect(aiseoIdx).toBeGreaterThan(moreIdx);
    expect(googleIdx).toBeGreaterThan(aiseoIdx);
    expect(industryIdx).toBeGreaterThan(googleIdx);

    expect(email.text).toContain("WEEKLY HIGHLIGHTS");
    expect(email.text).toContain(CHANGELOG_NEWSLETTER_WEEKLY_HIGHLIGHTS_EXPLAINER);
    expect(email.text).toContain("MORE YOU KNOW");
    expect(email.text).toContain("AISEO NEWS");
    expect(email.text).toContain("GOOGLE UPDATES");
    expect(email.text).toContain("INDUSTRY NEWS");
    expect(email.text).toContain(CHANGELOG_NEWSLETTER_AISEO_NEWS_EXPLAINER);
    expect(email.text).toContain(CHANGELOG_NEWSLETTER_GOOGLE_UPDATES_EXPLAINER);
    expect(email.text).toContain(CHANGELOG_NEWSLETTER_INDUSTRY_NEWS_EXPLAINER);
    expect(email.text).not.toContain("DO THIS WEEK");
    expect(email.text).not.toContain("LANGUAGES");
  });
});
