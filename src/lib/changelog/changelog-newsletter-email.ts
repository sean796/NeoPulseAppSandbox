/**
 * Multipart changelog newsletter: subject, preheader, HTML table, plain text.
 * Brand tokens match Neo Pulse dark shell (#02050a) and lime accent (#84bd00).
 */

import type { ChangelogNewsletterPayload } from "./changelog-newsletter-agent";

export const CHANGELOG_NEWSLETTER_HERO_CID = "hero";
export const CHANGELOG_NEWSLETTER_LOGO_CID = "logo";

/** Neo Pulse brand accent (matches public/branding SVGs). */
export const NEO_PULSE_BRAND_ACCENT = "#84bd00";
export const NEO_PULSE_BRAND_BG = "#02050a";
export const NEO_PULSE_BRAND_PANEL = "#0c0f14";

export type ChangelogNewsletterEmailParts = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildChangelogNewsletterSubject(payload: ChangelogNewsletterPayload): string {
  return `Neo Pulse Update: ${payload.title}`;
}

export function buildChangelogNewsletterPreheader(payload: ChangelogNewsletterPayload): string {
  const first = payload.highlights[0]?.trim();
  if (first) return first.slice(0, 140);
  return `${payload.commitCount} commits · ${formatDisplayDate(payload.date)}`;
}

function sectionHeading(label: string): string {
  return `<tr><td style="padding:28px 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#f4f4f5;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(label)}</td></tr>`;
}

function bulletList(items: string[]): string {
  const lis = items
    .map(
      (item) =>
        `<li style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#d4d4d8;">${escapeHtml(item)}</li>`,
    )
    .join("");
  return `<tr><td style="padding:0;"><ul style="margin:0;padding:0 0 0 20px;">${lis}</ul></td></tr>`;
}

function linkedItem(args: {
  title: string;
  body: string;
  meta?: string;
  theme?: string;
  sourceUrl: string;
}): string {
  const meta = args.meta
    ? `<div style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#a1a1aa;">${escapeHtml(args.meta)}</div>`
    : "";
  const theme = args.theme
    ? `<div style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_BRAND_ACCENT};">Pulse theme: ${escapeHtml(args.theme)}</div>`
    : "";
  return `<tr><td style="padding:0 0 18px 0;">
${meta}
${theme}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#fafafa;margin:0 0 6px 0;">${escapeHtml(args.title)}</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#d4d4d8;margin:0 0 6px 0;">${escapeHtml(args.body)}</div>
<a href="${escapeHtml(args.sourceUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_BRAND_ACCENT};text-decoration:underline;">Read source</a>
</td></tr>`;
}

function brandLockupHtml(logoCid?: string): string {
  if (logoCid) {
    return `<img src="cid:${escapeHtml(logoCid)}" width="180" height="41" alt="neopulse" style="display:block;width:180px;height:auto;border:0;outline:none;">`;
  }
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;"><span style="color:${NEO_PULSE_BRAND_ACCENT};">neo</span><span style="color:#ffffff;">pulse</span></span>`;
}

export function buildChangelogNewsletterHtml(
  payload: ChangelogNewsletterPayload,
  options?: { heroCid?: string; logoCid?: string },
): string {
  const heroCid = options?.heroCid ?? CHANGELOG_NEWSLETTER_HERO_CID;
  const subject = buildChangelogNewsletterSubject(payload);
  const preheader = buildChangelogNewsletterPreheader(payload);
  const dateLabel = formatDisplayDate(payload.date);

  const highlightRows =
    payload.highlights.length > 0
      ? bulletList(payload.highlights)
      : `<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#a1a1aa;">No highlights on this entry.</td></tr>`;

  const newsRows = payload.news
    .map((n) =>
      linkedItem({
        title: n.title,
        body: n.summary,
        meta: n.date,
        theme: n.pulseTheme,
        sourceUrl: n.sourceUrl,
      }),
    )
    .join("");

  const languageRows = payload.languages
    .map((l) =>
      linkedItem({
        title: l.name,
        body: l.whyItMatters,
        theme: l.pulseTheme,
        sourceUrl: l.sourceUrl,
      }),
    )
    .join("");

  const tipRows = payload.tips
    .map((t) =>
      linkedItem({
        title: t.title,
        body: t.body,
        theme: t.pulseTheme,
        sourceUrl: t.sourceUrl,
      }),
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${NEO_PULSE_BRAND_BG};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${NEO_PULSE_BRAND_BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background-color:${NEO_PULSE_BRAND_PANEL};">
<tr><td style="padding:28px 28px 12px 28px;">${brandLockupHtml(options?.logoCid)}</td></tr>
<tr><td style="padding:0 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:1.3;color:#fafafa;">${escapeHtml(payload.title)}</td></tr>
<tr><td style="padding:0 28px 20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#a1a1aa;">${escapeHtml(dateLabel)} · ${payload.commitCount} commits</td></tr>
<tr><td style="padding:0 28px 8px 28px;">
<img src="cid:${escapeHtml(heroCid)}" width="544" alt="Neo Pulse product update" style="display:block;width:100%;max-width:544px;height:auto;border:0;outline:none;">
</td></tr>
<tr><td style="padding:8px 28px 28px 28px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${sectionHeading("Highlights")}
${highlightRows}
${sectionHeading("Agentic SEO news")}
${newsRows}
${sectionHeading("Languages")}
${languageRows}
${sectionHeading("Must read")}
${tipRows}
</table>
</td></tr>
<tr><td style="padding:0 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#71717a;">Sent by Neo Pulse. Reply to this email to reach sean@neodigital.ca.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildChangelogNewsletterText(payload: ChangelogNewsletterPayload): string {
  const dateLabel = formatDisplayDate(payload.date);
  const lines: string[] = [
    "neopulse",
    payload.title,
    `${dateLabel} · ${payload.commitCount} commits`,
    "",
    "HIGHLIGHTS",
  ];
  if (payload.highlights.length === 0) {
    lines.push("- No highlights on this entry.");
  } else {
    for (const h of payload.highlights) lines.push(`- ${h}`);
  }
  lines.push("", "AGENTIC SEO NEWS");
  for (const n of payload.news) {
    lines.push(`- ${n.title} (${n.date})`);
    lines.push(`  Pulse theme: ${n.pulseTheme}`);
    lines.push(`  ${n.summary}`);
    lines.push(`  ${n.sourceUrl}`);
  }
  lines.push("", "LANGUAGES");
  for (const l of payload.languages) {
    lines.push(`- ${l.name}`);
    lines.push(`  Pulse theme: ${l.pulseTheme}`);
    lines.push(`  ${l.whyItMatters}`);
    lines.push(`  ${l.sourceUrl}`);
  }
  lines.push("", "MUST READ");
  for (const t of payload.tips) {
    lines.push(`- ${t.title}`);
    lines.push(`  Pulse theme: ${t.pulseTheme}`);
    lines.push(`  ${t.body}`);
    lines.push(`  ${t.sourceUrl}`);
  }
  lines.push("", "Sent by Neo Pulse. Reply to reach sean@neodigital.ca.");
  return lines.join("\n");
}

export function buildChangelogNewsletterEmail(
  payload: ChangelogNewsletterPayload,
  options?: { heroCid?: string; logoCid?: string },
): ChangelogNewsletterEmailParts {
  return {
    subject: buildChangelogNewsletterSubject(payload),
    preheader: buildChangelogNewsletterPreheader(payload),
    html: buildChangelogNewsletterHtml(payload, options),
    text: buildChangelogNewsletterText(payload),
  };
}
