/**
 * Send one Neo Pulse changelog newsletter via AgentMail.
 *
 * Usage:
 *   npx tsx scripts/send-changelog-newsletter.ts [--dry-run] [--to=email]
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

import {
  CHANGELOG_NEWSLETTER_READING_SYSTEM,
  CHANGELOG_NEWSLETTER_WEB_MODEL,
  assembleChangelogNewsletter,
  buildChangelogNewsletterReadingUserPrompt,
  parseChangelogNewsletterReadingDraft,
  stripBannedChangelogTopics,
} from "../src/lib/changelog/changelog-newsletter-agent";
import { buildChangelogNewsletterEmail } from "../src/lib/changelog/changelog-newsletter-email";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const AGENTMAIL_API = "https://api.agentmail.to/v0";
const INBOX_CLIENT_ID = "neo-pulse-changelog";
const DEFAULT_TO = "sean@neodigital.ca";
const REPLY_TO = "sean@neodigital.ca";

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
if (!dryRun && !agentmailKey) {
  console.error("Set AGENTMAIL_API_KEY before sending (or pass --dry-run).");
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
  title?: string;
  date?: string;
  rangeFrom?: string;
  rangeTo?: string;
  commitCount?: number;
  highlights?: string[];
  createdAt?: string;
  sections?: Array<{ heading?: string; items?: string[] }>;
};

const MAX_COMMIT_SUBJECTS = 80;

function gitCommitSubjects(rangeFrom: string, rangeTo: string): string[] {
  const since = rangeFrom.trim();
  const until = rangeTo.trim();
  if (!since || !until) return [];
  try {
    const raw = execFileSync(
      "git",
      [
        "log",
        `--since=${since}`,
        `--until=${until} 23:59:59`,
        `--max-count=${MAX_COMMIT_SUBJECTS}`,
        "--pretty=format:%s",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function newestEntry(entries: unknown): ArchiveEntry {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Changelog archive is empty. Generate an entry on /changelog first.");
  }
  const sorted = [...(entries as ArchiveEntry[])].sort((a, b) => {
    const ad = a.date ?? "";
    const bd = b.date ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    const ac = a.createdAt ?? "";
    const bc = b.createdAt ?? "";
    if (ac === bc) return 0;
    return ac < bc ? 1 : -1;
  });
  return sorted[0]!;
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
  const entry = newestEntry(archive.entries);
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
  const commitSubjects = gitCommitSubjects(rangeFrom, rangeTo);
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
    `Newest entry: ${highlights.date} · ${highlights.title} (${highlights.commitCount} commits, ${commitSubjects.length} git subjects)`,
  );

  console.log(`Searching More you know articles with ${CHANGELOG_NEWSLETTER_WEB_MODEL}…`);
  const readingRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_WEB_MODEL,
      temperature: 0.2,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_READING_SYSTEM,
      user: buildChangelogNewsletterReadingUserPrompt(highlights),
    }),
  });
  const readingContent = extractChatContent(readingRaw);
  if (!readingContent.trim()) {
    throw new Error("OpenRouter reading draft returned empty content.");
  }
  const reading = parseChangelogNewsletterReadingDraft(readingContent);
  const payload = assembleChangelogNewsletter(highlights, reading);

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
