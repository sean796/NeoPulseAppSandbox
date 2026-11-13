/**
 * Multipart changelog newsletter: Highlights bullets and More you know articles.
 * No Languages. No hero image. No Do this week.
 */

import type { ChangelogNewsletterPayload } from "./changelog-newsletter-agent";

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

function articleCard(args: {
  title: string;
  meta?: string;
  summary: string;
  whyItHelps?: string;
  sourceUrl: string;
}): string {
  const meta = args.meta
    ? `<div style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#a1a1aa;">${escapeHtml(args.meta)}</div>`
    : "";
  const why = args.whyItHelps
    ? `<div style="margin:8px 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${NEO_PULSE_BRAND_ACCENT};">${escapeHtml(args.whyItHelps)}</div>`
    : "";
  return `<tr><td style="padding:0 0 20px 0;">
${meta}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#fafafa;margin:0 0 8px 0;">${escapeHtml(args.title)}</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#d4d4d8;margin:0 0 6px 0;">${escapeHtml(args.summary)}</div>
${why}
<a href="${escapeHtml(args.sourceUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_BRAND_ACCENT};text-decoration:underline;">Read article</a>
</td></tr>`;
}

function brandLockupHtml(): string {
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;"><span style="color:${NEO_PULSE_BRAND_ACCENT};">neo</span><span style="color:#ffffff;">pulse</span></span>`;
}

export function buildChangelogNewsletterHtml(payload: ChangelogNewsletterPayload): string {
  const subject = buildChangelogNewsletterSubject(payload);
  const preheader = buildChangelogNewsletterPreheader(payload);
  const dateLabel = formatDisplayDate(payload.date);

  const highlightRows =
    payload.highlights.length > 0
      ? bulletList(payload.highlights)
      : `<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#a1a1aa;">No highlights on this entry.</td></tr>`;

  const articleRows = payload.articles
    .map((a) =>
      articleCard({
        title: a.title,
        meta: a.date,
        summary: a.summary,
        whyItHelps: a.whyItHelps,
        sourceUrl: a.sourceUrl,
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
<tr><td style="padding:28px 28px 12px 28px;">${brandLockupHtml()}</td></tr>
<tr><td style="padding:0 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:1.3;color:#fafafa;">${escapeHtml(payload.title)}</td></tr>
<tr><td style="padding:0 28px 20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#a1a1aa;">${escapeHtml(dateLabel)} · ${payload.commitCount} commits</td></tr>
<tr><td style="padding:0 28px 28px 28px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${sectionHeading("Highlights")}
${highlightRows}
${sectionHeading("More you know")}
${articleRows}
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
  lines.push("", "MORE YOU KNOW");
  for (const a of payload.articles) {
    lines.push(`- ${a.title} (${a.date})`);
    lines.push(`  ${a.summary}`);
    lines.push(`  ${a.whyItHelps}`);
    lines.push(`  ${a.sourceUrl}`);
  }
  lines.push("", "Sent by Neo Pulse. Reply to reach sean@neodigital.ca.");
  return lines.join("\n");
}

export function buildChangelogNewsletterEmail(
  payload: ChangelogNewsletterPayload,
): ChangelogNewsletterEmailParts {
  return {
    subject: buildChangelogNewsletterSubject(payload),
    preheader: buildChangelogNewsletterPreheader(payload),
    html: buildChangelogNewsletterHtml(payload),
    text: buildChangelogNewsletterText(payload),
  };
}
