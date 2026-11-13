import { describe, expect, it } from "vitest";
import {
  CHANGELOG_NEWSLETTER_SYSTEM,
  assembleChangelogNewsletter,
  parseChangelogNewsletterWebDraft,
  type ChangelogNewsletterWebDraft,
} from "@/lib/changelog/changelog-newsletter-agent";
import {
  CHANGELOG_NEWSLETTER_HERO_CID,
  NEO_PULSE_BRAND_ACCENT,
  buildChangelogNewsletterEmail,
} from "@/lib/changelog/changelog-newsletter-email";

const VALID_DRAFT: ChangelogNewsletterWebDraft = {
  news: [
    {
      title: "Managed WordPress hosting security baseline rises",
      summary:
        "Hosts are tightening admin-user controls after a wave of credential abuse. Agency operators are auditing who can reset passwords on client sites.",
      date: "Nov 12, 2026",
      sourceUrl: "https://example.com/wp-host-users",
      pulseTheme: "Pulse Host site user management",
    },
    {
      title: "Search Console APIs stay central to client reporting",
      summary:
        "Agencies keep wiring GSC property data into narrative reports. Stable property IDs reduce month-to-month reconciliation work.",
      date: "Nov 11, 2026",
      sourceUrl: "https://example.com/gsc-reporting",
      pulseTheme: "Client reports and GSC seeding",
    },
    {
      title: "OpenRouter key rotation becomes standard for agencies",
      summary:
        "Teams are registering provider keys in-app and rotating them without redeploys. Clear key ownership cuts outage time.",
      date: "Nov 10, 2026",
      sourceUrl: "https://example.com/openrouter-keys",
      pulseTheme: "OpenRouter API keys",
    },
  ],
  languages: [
    {
      name: "PHP",
      whyItMatters: "Pulse Host hub WordPress and site admin flows still run on PHP.",
      sourceUrl: "https://example.com/php-wordpress",
      pulseTheme: "Pulse Host WordPress hub",
    },
    {
      name: "TypeScript",
      whyItMatters: "Neo Pulse reporting and OpenRouter harness code ships in TypeScript.",
      sourceUrl: "https://example.com/ts-saas",
      pulseTheme: "OpenRouter keys and reporting UI",
    },
    {
      name: "English",
      whyItMatters: "Client report narratives in this release target English-speaking operators first.",
      sourceUrl: "https://example.com/report-language",
      pulseTheme: "Server-side report narratives",
    },
  ],
  tips: [
    {
      title: "Audit hosted site users this week",
      body: "List every admin on Pulse Host sites and remove stale accounts before the next deploy cycle.",
      sourceUrl: "https://example.com/audit-wp-users",
      pulseTheme: "Pulse Host user management",
    },
    {
      title: "Confirm Semrush and GA4 IDs per client",
      body: "Match seeded project and property IDs against Integrations so reports pull the right properties.",
      sourceUrl: "https://example.com/verify-property-ids",
      pulseTheme: "Semrush and GA4 seeding",
    },
    {
      title: "Rotate OpenRouter keys after the restore",
      body: "Confirm the in-app OpenRouter key still resolves for research and image runs before the next client batch.",
      sourceUrl: "https://example.com/openrouter-verify",
      pulseTheme: "OpenRouter API keys",
    },
  ],
};

const ENTRY = {
  title: "Significant Improvements to Pulse Host and Reporting",
  date: "2026-11-13",
  commitCount: 125,
  highlights: [
    "Pulse Host site and user management expanded",
    "Client reports gained server-side narratives",
  ],
  sections: [
    {
      heading: "New",
      items: ["Site user management is now available"],
    },
  ],
};

describe("changelog newsletter web draft", () => {
  it("parses a complete web draft with pulseTheme", () => {
    const draft = parseChangelogNewsletterWebDraft(JSON.stringify(VALID_DRAFT));
    expect(draft.news).toHaveLength(3);
    expect(draft.news[0]?.pulseTheme).toContain("Pulse Host");
    expect(draft.languages).toHaveLength(3);
    expect(draft.tips).toHaveLength(3);
  });

  it("requires pulseTheme on every item", () => {
    const bad = {
      ...VALID_DRAFT,
      tips: [
        { title: "x", body: "y", sourceUrl: "https://example.com/a" },
        VALID_DRAFT.tips[1],
        VALID_DRAFT.tips[2],
      ],
    };
    expect(() => parseChangelogNewsletterWebDraft(JSON.stringify(bad))).toThrow(
      /changelog newsletter web draft/i,
    );
  });

  it("rejects missing https source URLs", () => {
    const bad = {
      ...VALID_DRAFT,
      news: [
        { ...VALID_DRAFT.news[0], sourceUrl: "http://insecure.example" },
        VALID_DRAFT.news[1],
        VALID_DRAFT.news[2],
      ],
    };
    expect(() => parseChangelogNewsletterWebDraft(JSON.stringify(bad))).toThrow(
      /changelog newsletter web draft/i,
    );
  });

  it("keeps the system prompt locked to Pulse update themes", () => {
    expect(CHANGELOG_NEWSLETTER_SYSTEM).toContain("topic map");
    expect(CHANGELOG_NEWSLETTER_SYSTEM).toContain("pulseTheme");
    expect(CHANGELOG_NEWSLETTER_SYSTEM).toContain("Reject generic AI hype");
  });

  it("assembles code-owned highlights with the web draft", () => {
    const payload = assembleChangelogNewsletter(ENTRY, VALID_DRAFT);
    expect(payload.title).toBe(ENTRY.title);
    expect(payload.commitCount).toBe(125);
    expect(payload.news[0]?.sourceUrl).toContain("https://");
  });
});

describe("changelog newsletter email", () => {
  it("builds branded html and plain text with Pulse themes", () => {
    const payload = assembleChangelogNewsletter(ENTRY, VALID_DRAFT);
    const email = buildChangelogNewsletterEmail(payload, {
      heroCid: CHANGELOG_NEWSLETTER_HERO_CID,
    });

    expect(email.subject).toBe(`Neo Pulse Update: ${ENTRY.title}`);
    expect(email.html).toContain(NEO_PULSE_BRAND_ACCENT);
    expect(email.html).toContain(">neo</span>");
    expect(email.html).toContain(">pulse</span>");
    expect(email.html).toContain("cid:hero");
    expect(email.html).toContain("Pulse theme:");
    expect(email.html).toContain("Pulse Host site user management");
    expect(email.html).not.toContain("#22c55e");
    expect(email.html).not.toContain("\u2014");

    expect(email.text).toContain("Pulse theme: Pulse Host user management");
    expect(email.text).toContain("MUST READ");
    expect(email.text).not.toContain("\u2014");
  });
});
