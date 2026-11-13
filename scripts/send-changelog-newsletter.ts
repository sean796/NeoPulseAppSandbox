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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHANGELOG_NEWSLETTER_HERO_PROMPT,
  CHANGELOG_NEWSLETTER_SYSTEM,
  CHANGELOG_NEWSLETTER_WEB_MODEL,
  assembleChangelogNewsletter,
  buildChangelogNewsletterUserPrompt,
  parseChangelogNewsletterWebDraft,
} from "../src/lib/changelog/changelog-newsletter-agent";
import {
  CHANGELOG_NEWSLETTER_HERO_CID,
  buildChangelogNewsletterEmail,
} from "../src/lib/changelog/changelog-newsletter-email";
import { DEFAULT_IMAGE_MODEL } from "../src/lib/image-model-defaults";

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
  commitCount?: number;
  highlights?: string[];
  createdAt?: string;
  sections?: Array<{ heading?: string; items?: string[] }>;
};

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

function extractImageBase64(data: Record<string, unknown>): { contentType: string; base64: string } {
  const choices = data.choices;
  const choice = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  if (message && typeof message === "object") {
    if (Array.isArray(message.images)) {
      for (const img of message.images as Array<Record<string, unknown>>) {
        const imageUrl = img?.image_url as { url?: string } | undefined;
        const url = imageUrl?.url || (img?.imageUrl as string | undefined) || (img?.url as string | undefined);
        if (typeof url === "string" && url.startsWith("data:image/")) {
          const comma = url.indexOf(",");
          if (comma > 0) {
            return { contentType: url.slice(5, url.indexOf(";")), base64: url.slice(comma + 1) };
          }
        }
      }
    }
    const content = message.content;
    if (typeof content === "string" && content.startsWith("data:image/")) {
      const comma = content.indexOf(",");
      if (comma > 0) {
        return { contentType: content.slice(5, content.indexOf(";")), base64: content.slice(comma + 1) };
      }
    }
    if (Array.isArray(content)) {
      for (const part of content as Array<Record<string, unknown>>) {
        const imageUrl = part?.image_url as { url?: string } | undefined;
        const url = imageUrl?.url || (part?.imageUrl as string | undefined);
        if (typeof url === "string" && url.startsWith("data:image/")) {
          const comma = url.indexOf(",");
          if (comma > 0) {
            return { contentType: url.slice(5, url.indexOf(";")), base64: url.slice(comma + 1) };
          }
        }
      }
    }
  }
  throw new Error("OpenRouter image response did not include a data:image payload.");
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
  const highlights = {
    title: String(entry.title || "").trim(),
    date: String(entry.date || "").trim(),
    commitCount: Number(entry.commitCount) || 0,
    highlights: Array.isArray(entry.highlights)
      ? entry.highlights.map((h) => String(h).trim()).filter(Boolean)
      : [],
    sections,
  };
  console.log(`Newest entry: ${highlights.date} · ${highlights.title} (${highlights.commitCount} commits)`);

  console.log(`Researching Pulse-relevant news with ${CHANGELOG_NEWSLETTER_WEB_MODEL}…`);
  const webRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: CHANGELOG_NEWSLETTER_WEB_MODEL,
      temperature: 0.2,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
      system: CHANGELOG_NEWSLETTER_SYSTEM,
      user: buildChangelogNewsletterUserPrompt(highlights),
    }),
  });
  const rawObj = webRaw.raw as Record<string, unknown> | undefined;
  const rawChoices = rawObj?.choices as Array<{ message?: { content?: string } }> | undefined;
  const webContent =
    typeof webRaw.content === "string"
      ? webRaw.content
      : typeof rawChoices?.[0]?.message?.content === "string"
        ? rawChoices[0].message.content
        : "";
  if (!webContent.trim()) {
    throw new Error("OpenRouter web draft returned empty content.");
  }
  const draft = parseChangelogNewsletterWebDraft(webContent);
  const payload = assembleChangelogNewsletter(highlights, draft);

  const logoSvgPath = path.join(REPO_ROOT, "public", "branding", "neo-pulse-light.svg");
  if (!fs.existsSync(logoSvgPath)) {
    throw new Error(`Missing brand lockup at ${logoSvgPath}`);
  }
  const logoSvgBase64 = fs.readFileSync(logoSvgPath).toString("base64");
  const logoDataUrl = `data:image/svg+xml;base64,${logoSvgBase64}`;

  console.log(`Generating branded hero with ${DEFAULT_IMAGE_MODEL}…`);
  const imageRaw = await hubApi("openrouter/chat-completion", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: DEFAULT_IMAGE_MODEL,
      modalities: ["text", "image"],
      maxTokens: 16384,
      image_config: { aspect_ratio: "16:9" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: CHANGELOG_NEWSLETTER_HERO_PROMPT },
            {
              type: "text",
              text: "Use the attached Neo Pulse brand lockup only for color and mark shape reference. Do not copy text or letters into the hero.",
            },
            { type: "image_url", image_url: { url: logoDataUrl } },
          ],
        },
      ],
    }),
  });
  const imagePayload = (imageRaw.raw as Record<string, unknown> | undefined) ?? imageRaw;
  const hero = extractImageBase64(imagePayload);
  const contentType = hero.contentType.startsWith("image/") ? hero.contentType : "image/png";

  // Wordmark is HTML (brand lime #84bd00 + white) so clients that block SVG still render brand.
  const emailParts = buildChangelogNewsletterEmail(payload, {
    heroCid: CHANGELOG_NEWSLETTER_HERO_CID,
  });

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
      attachments: [
        {
          filename: "hero.png",
          content_type: contentType,
          content_disposition: "inline",
          content_id: CHANGELOG_NEWSLETTER_HERO_CID,
          content: hero.base64,
        },
      ],
    }),
  });

  const messageId = String(sent.message_id || sent.messageId || "(no message_id)");
  console.log(`Sent. message_id=${messageId}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
