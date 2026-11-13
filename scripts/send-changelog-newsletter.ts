/**
 * Send one Neo Pulse changelog newsletter via AgentMail.
 *
 * Email lock: summary (plain-English hook + body) + Weekly highlights
 * (most significant repo updates only) + More you know (Pulse-relative)
 * + AISEO News + Google Updates + Industry News (fun stories).
 * Confident Morning Brew voice (never "mystery delivery" / clueless humor).
 *
 * Always generates a FRESH weekly-highlights entry from git commits after the
 * last archived entry before drafting the email. Never reuses a stale pack.
 *
 * Usage:
 *   npx tsx scripts/send-changelog-newsletter.ts [--dry-run] [--entry-only] [--to=email]
 *
 * Environment:
 *   AGENTMAIL_API_KEY             AgentMail bearer key (required to send)
 *   NEO_PULSE_CHANGELOG_EMAIL     Hub sign-in email (required)
 *   NEO_PULSE_CHANGELOG_PASSWORD  Hub sign-in password (required)
 *   NEO_PULSE_CHANGELOG_API_BASE  App base URL (default http://127.0.0.1:8080)
 *
 * Loads .env.local from the repo root when present. Never commit keys.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";
import {
  CHANGELOG_NEWSLETTER_AISEO_SYSTEM,
  CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_FULL_URL,
  CHANGELOG_NEWSLETTER_GOOGLE_SYSTEM,
  CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS,
  CHANGELOG_NEWSLETTER_INDUSTRY_SYSTEM,
  CHANGELOG_NEWSLETTER_INTRO_MODEL,
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
  buildChangelogNewsletterIntroUserPrompt,
  buildChangelogNewsletterReadingUserPrompt,
  parseChangelogNewsletterAiseoDraft,
  parseChangelogNewsletterGoogleDraft,
  parseChangelogNewsletterIndustryDraft,
  parseChangelogNewsletterIntroDraft,
  parseChangelogNewsletterReadingDraft,
  stripBannedChangelogTopics,
  type ChangelogNewsletterNewsSeed,
} from "../src/lib/changelog/changelog-newsletter-agent";
import { buildChangelogNewsletterEmail } from "../src/lib/changelog/changelog-newsletter-email";
import { parseModelJson } from "../src/lib/model-json";
import { randomUUID } from "node:crypto";

const CHANGELOG_WRITER_MODEL = "deepseek/deepseek-v4.1-flash";

const CHANGELOG_WRITER_SYSTEM = `You write one weekly changelog entry for the Neo Pulse web app, for the agency owner.

Grounding rules (non-negotiable):
- The commit pack in the user message is the ONLY source of facts. Never name a feature, fix, file, screen, or improvement that is not supported by a commit subject, body, or file list in the pack.
- Never invent dates, counts, or version numbers.
- Do NOT write an intro paragraph or summary.
- This is a WEEKLY HIGHLIGHTS entry, not a full commit dump.
- Include a "highlights" array with ONLY the 3 to 5 most significant weekly wins. Skip tiny, routine, or duplicate commits.
- Prefer product-facing outcomes a CEO would care about. Drop noise (typos, tiny renames, chore merges, test-only tweaks) unless that was the week's main ship.
- Group only the biggest themes using these headings when needed: "New", "Improved", "Fixed", "Behind the scenes".
- Keep sections sparse: at most 2 to 4 bullets per section, and only for the same top wins. Never try to cover every commit.
- Keep each bullet BRIEF and direct: 1 concise sentence naming what changed and where it applies in the app. No fluff, no raw file paths.
- Never use the em dash character. Use commas, periods, or parentheses instead.

Output (JSON only, no markdown fences, no commentary before or after):
{
  "title": "Short weekly title naming the main theme (max 12 words)",
  "highlights": ["One brief sentence per top weekly win"],
  "sections": [{ "heading": "New", "items": ["One brief, specific sentence per top win"] }]
}`;

const changelogDraftSchema = z.object({
  title: z.string().min(1),
  highlights: z.array(z.string().min(1)).default([]),
  sections: z.array(
    z.object({
      heading: z.string().min(1),
      items: z.array(z.string().min(1)),
    }),
  ),
});

type ChangelogCommit = {
  hash: string;
  date: string;
  subject: string;
  body: string;
  files: string[];
};

function buildChangelogWriterUserPrompt(
  commits: ChangelogCommit[],
  coveredThrough: string | null,
): string {
  const lines = commits.map((c) => {
    const files = c.files.length > 0 ? ` [files: ${c.files.slice(0, 8).join(", ")}]` : "";
    const body = c.body.trim() ? `\n  ${c.body.trim().replace(/\s+/g, " ").slice(0, 400)}` : "";
    return `- ${c.date} ${c.subject}${files}${body}`;
  });
  const from = commits[0]?.date ?? "";
  const to = commits[commits.length - 1]?.date ?? "";
  return `Covered period: ${from} to ${to} (${commits.length} commits). Previous archive coverage ended: ${coveredThrough ?? "never (first entry)"}.

Commit pack (oldest first):
${lines.join("\n")}

Write the weekly highlights changelog JSON now. Most significant wins only.`;
}

function buildFreshChangelogEntry(
  draft: z.infer<typeof changelogDraftSchema>,
  commits: ChangelogCommit[],
  entryDate: string,
) {
  return {
    id: `${entryDate}-${randomUUID()}`,
    date: entryDate,
    rangeFrom: commits[0]?.date ?? entryDate,
    rangeTo: commits[commits.length - 1]?.date ?? entryDate,
    commitCount: commits.length,
    title: draft.title,
    highlights: [...(draft.highlights ?? [])],
    sections: draft.sections.map((section) => ({
      heading: section.heading,
      items: [...section.items],
    })),
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const AGENTMAIL_API = "https://api.agentmail.to/v0";
const INBOX_CLIENT_ID = "neo-pulse-changelog";
const DEFAULT_TO = "sean@neodigital.ca";
const REPLY_TO = "sean@neodigital.ca";
const MAX_PACK_COMMITS = 490;

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(REPO_ROOT, ".env.local"));
loadEnvFile(path.join(REPO_ROOT, ".env"));

const dryRun = process.argv.includes("--dry-run");
const entryOnly = process.argv.includes("--entry-only");
const toArg = process.argv.find((a) => a.startsWith("--to="))?.slice("--to=".length);
const to = (toArg || DEFAULT_TO).trim();

const email = process.env.NEO_PULSE_CHANGELOG_EMAIL?.trim();
const password = process.env.NEO_PULSE_CHANGELOG_PASSWORD?.trim();
const base = (process.env.NEO_PULSE_CHANGELOG_API_BASE?.trim() || "http://127.0.0.1:8080").replace(
  /\/+$/,
  "",
);
const agentmailKey = process.env.AGENTMAIL_API_KEY?.trim();

if (!email || !password) {
  console.error("Set NEO_PULSE_CHANGELOG_EMAIL and NEO_PULSE_CHANGELOG_PASSWORD first.");
  process.exit(1);
}
if (!dryRun && !entryOnly && !agentmailKey) {
  console.error("Set AGENTMAIL_API_KEY before sending (or pass --dry-run / --entry-only).");
  process.exit(1);
}

async function hubApi(apiPath: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}/api/${apiPath}`, options);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || `Hub request failed (${res.status}) for ${apiPath}`));
  }
  return data;
}

async function agentmail(apiPath: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${AGENTMAIL_API}${apiPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${agentmailKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = String(data.message || data.error || JSON.stringify(data).slice(0, 400));
    throw new Error(`AgentMail ${res.status}: ${msg}`);
  }
  return data;
}

type ArchiveEntry = {
  id?: string;
  title?: string;
  date?: string;
  rangeFrom?: string;
  rangeTo?: string;
  commitCount?: number;
  highlights?: string[];
  createdAt?: string;
  sections?: Array<{ heading?: string; items?: string[] }>;
};

function newestEntry(entries: unknown): ArchiveEntry | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const sorted = [...(entries as ArchiveEntry[])].sort((a, b) => {
    const ad = a.date ?? "";
    const bd = b.date ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    const ac = a.createdAt ?? "";
    const bc = b.createdAt ?? "";
    if (ac === bc) return 0;
    return ac < bc ? 1 : -1;
  });
  return sorted[0] ?? null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function gitCommitsSince(sinceIso: string): ChangelogCommit[] {
  const subjectsRaw = execFileSync(
    "git",
    [
      "log",
      `--since=${sinceIso}`,
      `--max-count=${MAX_PACK_COMMITS}`,
      "--pretty=format:%H%x1f%cs%x1f%s%x1f%b%x1e",
    ],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const filesRaw = execFileSync(
    "git",
    ["log", `--since=${sinceIso}`, `--max-count=${MAX_PACK_COMMITS}`, "--name-only", "--pretty=format:%H"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const filesByHash = new Map<string, string[]>();
  for (const block of filesRaw.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    filesByHash.set(lines[0]!, lines.slice(1));
  }
  const commits = subjectsRaw
    .split("\x1e")
    .map((record) => record.replace(/^\r?\n/, ""))
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [hash, date, subject, body = ""] = record.split("\x1f");
      return {
        hash: (hash || "").trim(),
        date: (date || "").trim(),
        subject: (subject || "").trim(),
        body: (body || "").trim(),
        files: filesByHash.get((hash || "").trim()) ?? [],
      };
    })
    .filter((c) => c.hash && c.date && c.subject);
  // git log returns newest first; writer expects oldest first.
  return commits.reverse();
}

function extractChatContent(raw: Record<string, unknown>): string {
  if (typeof raw.content === "string" && raw.content.trim()) return raw.content;
  const rawObj = raw.raw as Record<string, unknown> | undefined;
  const rawChoices = rawObj?.choices as Array<{ message?: { content?: string } }> | undefined;
  if (typeof rawChoices?.[0]?.message?.content === "string") {
    return rawChoices[0].message.content;
  }
  return "";
}

async function generateFreshEntry(
  authHeaders: Record<string, string>,
  previous: ArchiveEntry | null,
): Promise<ArchiveEntry> {
  const since =
    previous?.createdAt?.trim() ||
    previous?.date?.trim() ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Collecting git commits after ${since} for a fresh changelog entry…`);
  const commits = gitCommitsSince(since);
  if (commits.length === 0) {
    if (!previous?.title) {
      throw new Error(
        `No git commits after ${since} and no prior changelog entry. Refusing stale/empty send.`,
      );
    }
    console.log(
      `No newer commits since ${since}. Using latest archive entry for this send: ${previous.title}`,
    );
    return previous;
  }
  console.log(`Found ${commits.length} commit(s). Feeding source pool…`);
  await hubApi("changelog/source/", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ commits }),
  });

  console.log(`Writing fresh changelog entry with ${CHANGELOG_WRITER_MODEL}…`);
  const draftRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_WRITER_MODEL,
      temperature: 0.3,
      maxTokens: 8192,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_WRITER_SYSTEM,
      user: buildChangelogWriterUserPrompt(commits, previous?.date?.trim() || null),
    }),
  });
  const draftContent = extractChatContent(draftRaw);
  if (!draftContent.trim()) {
    throw new Error("Changelog writer returned empty content.");
  }
  const draft = parseModelJson(draftContent, changelogDraftSchema, "changelog writer draft");
  const nextEntry = buildFreshChangelogEntry(draft, commits, todayIso());
  const saved = await hubApi("changelog/entry/", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ entry: nextEntry }),
  });
  const savedNewest = newestEntry(saved.entries);
  if (!savedNewest?.title) {
    throw new Error("Save changelog entry did not return the new entry.");
  }
  console.log(
    `Fresh entry saved: ${savedNewest.date} · ${savedNewest.title} (${savedNewest.commitCount} commits)`,
  );
  return savedNewest;
}

async function main(): Promise<void> {
  console.log(`Signing in to hub at ${base}…`);
  const login = await hubApi("auth/login/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.sessionToken) {
    throw new Error("Sign-in did not return a session token.");
  }
  const authHeaders = {
    Authorization: `Bearer ${String(login.sessionToken)}`,
    "Content-Type": "application/json",
  };

  const archive = await hubApi("changelog/", { headers: authHeaders });
  const previous = newestEntry(archive.entries);
  if (previous?.title) {
    console.log(
      `Previous entry (will not reuse): ${previous.date} · ${previous.title} · created ${previous.createdAt || "(unknown)"}`,
    );
  }

  const entry = await generateFreshEntry(authHeaders, previous);
  if (entryOnly) {
    console.log(`Entry-only complete. Archive now has entry: ${entry.date} · ${entry.title}`);
    return;
  }
  const sections = Array.isArray(entry.sections)
    ? entry.sections
        .map((section) => ({
          heading: String(section.heading || "").trim(),
          items: Array.isArray(section.items)
            ? section.items.map((item) => String(item).trim()).filter(Boolean)
            : [],
        }))
        .filter((section) => section.heading && section.items.length > 0)
    : [];
  const rangeFrom = String(entry.rangeFrom || entry.date || "").trim();
  const rangeTo = String(entry.rangeTo || entry.date || "").trim();
  const commitSubjects = gitCommitsSince(previous?.createdAt || previous?.date || rangeFrom).map(
    (c) => c.subject,
  );
  const highlights = stripBannedChangelogTopics({
    title: String(entry.title || "").trim(),
    date: String(entry.date || "").trim(),
    commitCount: Number(entry.commitCount) || 0,
    highlights: Array.isArray(entry.highlights)
      ? entry.highlights.map((h) => String(h).trim()).filter(Boolean)
      : [],
    sections,
    commitSubjects,
    rangeFrom,
    rangeTo,
  });
  console.log(
    `Newsletter pack: ${highlights.date} · ${highlights.title} (${highlights.commitCount} commits)`,
  );

  console.log(`Writing Morning Brew editorial (hook/body/highlights) with ${CHANGELOG_NEWSLETTER_INTRO_MODEL}…`);
  const introRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_INTRO_MODEL,
      temperature: 0.45,
      maxTokens: 3072,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_INTRO_SYSTEM,
      user: buildChangelogNewsletterIntroUserPrompt(highlights),
    }),
  });
  const introContent = extractChatContent(introRaw);
  if (!introContent.trim()) {
    throw new Error("OpenRouter editorial draft returned empty content.");
  }
  const intro = parseChangelogNewsletterIntroDraft(introContent);

  // Code-owned Pulse-relative seeds only. Model invents dead evergreen URLs; do not ask it for URLs.
  const pulseSeeds: ChangelogNewsletterNewsSeed[] = CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS.map(
    (s) => ({ ...s }),
  );
  console.log("Verifying More you know Pulse-theme URLs are live (fail on 404)…");
  await assertNewsletterArticleSourcesReachable(
    pulseSeeds.map((s) => ({ title: s.title, sourceUrl: s.url })),
  );

  console.log(`Writing Pulse-relative More you know cards with ${CHANGELOG_NEWSLETTER_WEB_MODEL}…`);
  const readingRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_WEB_MODEL,
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_READING_SYSTEM,
      user: buildChangelogNewsletterReadingUserPrompt(highlights, pulseSeeds),
    }),
  });
  const readingContent = extractChatContent(readingRaw);
  if (!readingContent.trim()) {
    throw new Error("OpenRouter More you know draft returned empty content.");
  }
  const reading = parseChangelogNewsletterReadingDraft(readingContent);
  for (let i = 0; i < pulseSeeds.length; i++) {
    const want = pulseSeeds[i]!.url;
    const got = reading.articles[i]?.sourceUrl;
    if (got !== want) {
      throw new Error(
        `More you know article ${i + 1} URL drifted from seed. Expected ${want}, got ${got ?? "(missing)"}.`,
      );
    }
  }

  const aiseoSeeds: ChangelogNewsletterNewsSeed[] = CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS.map(
    (s) => ({ ...s }),
  );
  console.log("Verifying AISEO News wire-seed URLs are live (fail on 404)…");
  await assertNewsletterArticleSourcesReachable(
    aiseoSeeds.map((s) => ({ title: s.title, sourceUrl: s.url })),
  );
  console.log(`Writing AISEO News cards with ${CHANGELOG_NEWSLETTER_WEB_MODEL}…`);
  const aiseoRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_WEB_MODEL,
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_AISEO_SYSTEM,
      user: buildChangelogNewsletterAiseoUserPrompt(aiseoSeeds),
    }),
  });
  const aiseoContent = extractChatContent(aiseoRaw);
  if (!aiseoContent.trim()) {
    throw new Error("OpenRouter AISEO News draft returned empty content.");
  }
  const aiseo = parseChangelogNewsletterAiseoDraft(aiseoContent);
  for (let i = 0; i < aiseoSeeds.length; i++) {
    const want = aiseoSeeds[i]!.url;
    const got = aiseo.articles[i]?.sourceUrl;
    if (got !== want) {
      throw new Error(
        `AISEO News article ${i + 1} URL drifted from seed. Expected ${want}, got ${got ?? "(missing)"}.`,
      );
    }
  }

  const googleSeeds: ChangelogNewsletterNewsSeed[] = CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS.map(
    (s) => ({ ...s }),
  );
  console.log("Verifying Google Updates wire-seed URLs are live (fail on 404)…");
  await assertNewsletterArticleSourcesReachable(
    googleSeeds.map((s) => ({ title: s.title, sourceUrl: s.url })),
  );
  console.log(`Writing Google Updates cards with ${CHANGELOG_NEWSLETTER_WEB_MODEL}…`);
  const googleRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_WEB_MODEL,
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_GOOGLE_SYSTEM,
      user: buildChangelogNewsletterGoogleUserPrompt(googleSeeds),
    }),
  });
  const googleContent = extractChatContent(googleRaw);
  if (!googleContent.trim()) {
    throw new Error("OpenRouter Google Updates draft returned empty content.");
  }
  const google = parseChangelogNewsletterGoogleDraft(googleContent);
  for (let i = 0; i < googleSeeds.length; i++) {
    const want = googleSeeds[i]!.url;
    const got = google.articles[i]?.sourceUrl;
    if (got !== want) {
      throw new Error(
        `Google Updates article ${i + 1} URL drifted from seed. Expected ${want}, got ${got ?? "(missing)"}.`,
      );
    }
  }

  const industrySeeds: ChangelogNewsletterNewsSeed[] =
    CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS.map((s) => ({ ...s }));
  console.log("Verifying Industry News wire-seed URLs are live (fail on 404)…");
  await assertNewsletterArticleSourcesReachable(
    industrySeeds.map((s) => ({ title: s.title, sourceUrl: s.url })),
  );
  console.log(`Writing Industry News cards with ${CHANGELOG_NEWSLETTER_WEB_MODEL}…`);
  const industryRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_WEB_MODEL,
      temperature: 0.35,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_INDUSTRY_SYSTEM,
      user: buildChangelogNewsletterIndustryUserPrompt(industrySeeds),
    }),
  });
  const industryContent = extractChatContent(industryRaw);
  if (!industryContent.trim()) {
    throw new Error("OpenRouter Industry News draft returned empty content.");
  }
  const industry = parseChangelogNewsletterIndustryDraft(industryContent);
  for (let i = 0; i < industrySeeds.length; i++) {
    const want = industrySeeds[i]!.url;
    const got = industry.articles[i]?.sourceUrl;
    if (got !== want) {
      throw new Error(
        `Industry News article ${i + 1} URL drifted from seed. Expected ${want}, got ${got ?? "(missing)"}.`,
      );
    }
  }

  const payload = assembleChangelogNewsletter(
    highlights,
    intro,
    reading,
    aiseo,
    google,
    industry,
    CHANGELOG_NEWSLETTER_FULL_URL,
  );

  const emailParts = buildChangelogNewsletterEmail(payload);

  const outDir = path.join(REPO_ROOT, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "changelog-newsletter-preview.html");
  const textPath = path.join(outDir, "changelog-newsletter-preview.txt");
  fs.writeFileSync(htmlPath, emailParts.html, "utf8");
  fs.writeFileSync(textPath, emailParts.text, "utf8");
  console.log(`Wrote preview: ${htmlPath}`);

  if (dryRun) {
    console.log(`Dry run only. Would send to ${to}. Subject: ${emailParts.subject}`);
    return;
  }

  console.log("Ensuring AgentMail inbox…");
  const inbox = await agentmail("/inboxes", {
    method: "POST",
    body: JSON.stringify({
      username: "neo-pulse-changelog",
      display_name: "Neo Pulse",
      client_id: INBOX_CLIENT_ID,
    }),
  });
  const inboxId = String(inbox.inbox_id || inbox.inboxId || "");
  if (!inboxId) {
    throw new Error("AgentMail inbox create did not return inbox_id.");
  }
  console.log(`Inbox: ${inboxId}`);

  console.log(`Sending to ${to}…`);
  const sent = await agentmail(`/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: "POST",
    body: JSON.stringify({
      to: [to],
      reply_to: [REPLY_TO],
      subject: emailParts.subject,
      text: emailParts.text,
      html: emailParts.html,
      labels: ["changelog-newsletter", "test"],
    }),
  });

  const messageId = String(sent.message_id || sent.messageId || "(no message_id)");
  console.log(`Sent. message_id=${messageId}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
