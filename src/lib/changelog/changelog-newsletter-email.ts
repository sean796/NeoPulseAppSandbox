/**
 * Multipart changelog newsletter (Morning Brew / TLDR skim layout).
 * Fluid full-width shell + framed section wells with green accent bars.
 * Layout: summary → Weekly highlights → More you know → AISEO News → Google Updates → Industry News.
 */

import type { ChangelogNewsletterPayload } from "./changelog-newsletter-agent";
import { CHANGELOG_NEWSLETTER_FULL_URL } from "./changelog-newsletter-agent";

export const NEO_PULSE_BRAND_ACCENT = "#84bd00";
export const NEO_PULSE_BRAND_BG = "#02050a";
export const NEO_PULSE_BRAND_PANEL = "#0c0f14";
export const NEO_PULSE_BRAND_WELL = "#12161e";
export const NEO_PULSE_BRAND_WELL_ALT = "#0c0f14";
/** Body copy on dark: white only. Green is reserved for accents/links. */
export const NEO_PULSE_NEWSLETTER_TEXT = "#ffffff";
export const NEO_PULSE_NEWSLETTER_HEADING = "#ffffff";
/** Fluid content width for Gmail reading pane (not skinny 600). */
export const NEO_PULSE_NEWSLETTER_MAX_WIDTH = 720;

/** Fixed explainer under Weekly highlights. Code-owned, not LLM. */
export const CHANGELOG_NEWSLETTER_WEEKLY_HIGHLIGHTS_EXPLAINER =
  "The most significant Pulse ships from this week. Not every commit, just the wins worth knowing.";

/** Fixed explainer under More you know. Code-owned, not LLM. */
export const CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER =
  "Why these reads: three articles that help explain what this Pulse update is really about, in plain English, so the ship makes sense beyond the product screen.";

/** Fixed explainer under AISEO News. Code-owned, not LLM. */
export const CHANGELOG_NEWSLETTER_AISEO_NEWS_EXPLAINER =
  "AI SEO this week: AI Overviews, GEO, and citation visibility that changes how agencies win search.";

/** Fixed explainer under Google Updates. Code-owned, not LLM. */
export const CHANGELOG_NEWSLETTER_GOOGLE_UPDATES_EXPLAINER =
  "Google Search updates that hit rankings, reporting, or client briefs. Watch these first.";

/** Fixed explainer under Industry News. Code-owned, not LLM. */
export const CHANGELOG_NEWSLETTER_INDUSTRY_NEWS_EXPLAINER =
  "Fun stories from the wider industry this week. Skim for coffee, not homework.";

export { CHANGELOG_NEWSLETTER_FULL_URL };

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

/** Gmail-safe subject: short, never mid-word truncated. */
export function buildChangelogNewsletterSubject(payload: ChangelogNewsletterPayload): string {
  const hook = payload.hook?.trim().replace(/\s+/g, " ") ?? "";
  if (hook) {
    const prefix = "Neo Pulse: ";
    const maxLen = 60;
    const full = `${prefix}${hook}`;
    if (full.length <= maxLen) return full;
    const budget = maxLen - prefix.length;
    if (hook.length <= budget) return full;
    const cut = hook.slice(0, budget);
    const lastSpace = cut.lastIndexOf(" ");
    const safe = (lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trim().replace(/[.,;:]+$/, "");
    return `${prefix}${safe}`;
  }
  return "Neo Pulse Update";
}

export function buildChangelogNewsletterPreheader(payload: ChangelogNewsletterPayload): string {
  const body = payload.body?.trim();
  if (body) return body.slice(0, 140);
  const first = payload.highlights[0]?.trim();
  if (first) return first.slice(0, 140);
  return `${payload.commitCount} commits · ${formatDisplayDate(payload.date)}`;
}

function brandLockupHtml(): string {
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em;"><span style="color:${NEO_PULSE_BRAND_ACCENT};">neo</span><span style="color:#ffffff;">pulse</span></span>`;
}

/** Framed section well with left green accent bar (Gmail-safe nested tables). */
function framedSection(args: {
  label?: string;
  wellBg: string;
  topMarginPx?: number;
  innerHtml: string;
}): string {
  const top = args.topMarginPx ?? 16;
  const labelRow = args.label
    ? `<tr><td style="padding:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:${NEO_PULSE_NEWSLETTER_HEADING};letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(args.label)}</td></tr>`
    : "";
  return `<tr><td style="padding:${top}px 0 0 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${args.wellBg};">
<tr>
<td width="4" style="width:4px;background-color:${NEO_PULSE_BRAND_ACCENT};font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:22px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${labelRow}
${args.innerHtml}
</table>
</td>
</tr>
</table>
</td></tr>`;
}

function bulletListInner(items: string[]): string {
  const lis = items
    .map(
      (item) =>
        `<li style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${NEO_PULSE_NEWSLETTER_TEXT};">${escapeHtml(item)}</li>`,
    )
    .join("");
  return `<tr><td style="padding:0;"><ul style="margin:0;padding:0 0 0 20px;">${lis}</ul></td></tr>`;
}

function summaryInner(hook: string, body: string, changelogUrl: string): string {
  return `<tr><td style="padding:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:1.35;color:${NEO_PULSE_NEWSLETTER_HEADING};">${escapeHtml(hook)}</td></tr>
<tr><td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:${NEO_PULSE_NEWSLETTER_TEXT};">${escapeHtml(body)}</td></tr>
<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
<a href="${escapeHtml(changelogUrl)}" style="color:${NEO_PULSE_BRAND_ACCENT};text-decoration:underline;font-weight:700;">Full changelog →</a>
</td></tr>`;
}

function explainerInner(text: string): string {
  return `<tr><td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${NEO_PULSE_NEWSLETTER_TEXT};">${escapeHtml(text)}</td></tr>`;
}

function articleCardInner(args: {
  title: string;
  meta?: string;
  summary: string;
  whyItHelps?: string;
  sourceUrl: string;
  last?: boolean;
}): string {
  const bottom = args.last ? "0" : "20";
  const meta = args.meta
    ? `<div style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_NEWSLETTER_TEXT};">${escapeHtml(args.meta)}</div>`
    : "";
  const why = args.whyItHelps
    ? `<div style="margin:8px 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${NEO_PULSE_BRAND_ACCENT};">${escapeHtml(args.whyItHelps)}</div>`
    : "";
  return `<tr><td style="padding:0 0 ${bottom}px 0;">
${meta}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:${NEO_PULSE_NEWSLETTER_HEADING};margin:0 0 8px 0;">${escapeHtml(args.title)}</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:${NEO_PULSE_NEWSLETTER_TEXT};margin:0 0 6px 0;">${escapeHtml(args.summary)}</div>
${why}
<a href="${escapeHtml(args.sourceUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_BRAND_ACCENT};text-decoration:underline;">Read →</a>
</td></tr>`;
}

function articlesInner(articles: ChangelogNewsletterPayload["articles"]): string {
  return articles
    .map((a, i) =>
      articleCardInner({
        title: a.title,
        meta: a.date,
        summary: a.summary,
        whyItHelps: a.whyItHelps,
        sourceUrl: a.sourceUrl,
        last: i === articles.length - 1,
      }),
    )
    .join("");
}

export function buildChangelogNewsletterHtml(payload: ChangelogNewsletterPayload): string {
  const subject = buildChangelogNewsletterSubject(payload);
  const preheader = buildChangelogNewsletterPreheader(payload);
  const dateLabel = formatDisplayDate(payload.date);
  const changelogUrl = payload.changelogUrl || CHANGELOG_NEWSLETTER_FULL_URL;
  const w = NEO_PULSE_NEWSLETTER_MAX_WIDTH;

  const highlightInner =
    payload.highlights.length > 0
      ? bulletListInner(payload.highlights)
      : `<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_NEWSLETTER_TEXT};">No highlights on this entry.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${NEO_PULSE_BRAND_BG};width:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${NEO_PULSE_BRAND_BG};">
<tr><td align="center" style="padding:0;width:100%;">
<table role="presentation" width="${w}" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:${w}px;background-color:${NEO_PULSE_BRAND_BG};">
<tr><td style="padding:28px 20px 20px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${NEO_PULSE_BRAND_WELL};">
<tr>
<td width="4" style="width:4px;background-color:${NEO_PULSE_BRAND_ACCENT};font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:22px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:0 0 8px 0;">${brandLockupHtml()}</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_NEWSLETTER_TEXT};">${escapeHtml(dateLabel)} · ${payload.commitCount} commits</td></tr>
</table>
</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:0 20px 28px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
${framedSection({
  wellBg: NEO_PULSE_BRAND_PANEL,
  topMarginPx: 0,
  innerHtml: summaryInner(payload.hook, payload.body, changelogUrl),
})}
${framedSection({
  label: "Weekly highlights",
  wellBg: NEO_PULSE_BRAND_WELL,
  topMarginPx: 16,
  innerHtml: `${explainerInner(CHANGELOG_NEWSLETTER_WEEKLY_HIGHLIGHTS_EXPLAINER)}${highlightInner}`,
})}
${framedSection({
  label: "More you know",
  wellBg: NEO_PULSE_BRAND_WELL_ALT,
  topMarginPx: 16,
  innerHtml: `${explainerInner(CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER)}${articlesInner(payload.articles)}`,
})}
${framedSection({
  label: "AISEO News",
  wellBg: NEO_PULSE_BRAND_WELL,
  topMarginPx: 16,
  innerHtml: `${explainerInner(CHANGELOG_NEWSLETTER_AISEO_NEWS_EXPLAINER)}${articlesInner(payload.aiseoArticles)}`,
})}
${framedSection({
  label: "Google Updates",
  wellBg: NEO_PULSE_BRAND_WELL_ALT,
  topMarginPx: 16,
  innerHtml: `${explainerInner(CHANGELOG_NEWSLETTER_GOOGLE_UPDATES_EXPLAINER)}${articlesInner(payload.googleArticles)}`,
})}
${framedSection({
  label: "Industry News",
  wellBg: NEO_PULSE_BRAND_WELL,
  topMarginPx: 16,
  innerHtml: `${explainerInner(CHANGELOG_NEWSLETTER_INDUSTRY_NEWS_EXPLAINER)}${articlesInner(payload.industryArticles)}`,
})}
<tr><td style="padding:24px 4px 8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${NEO_PULSE_NEWSLETTER_TEXT};">Sent by Neo Pulse. Reply to this email to reach sean@neodigital.ca.</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildChangelogNewsletterText(payload: ChangelogNewsletterPayload): string {
  const dateLabel = formatDisplayDate(payload.date);
  const changelogUrl = payload.changelogUrl || CHANGELOG_NEWSLETTER_FULL_URL;
  const lines: string[] = [
    "neopulse",
    `${dateLabel} · ${payload.commitCount} commits`,
    "",
    payload.hook,
    "",
    payload.body,
    "",
    `Full changelog → ${changelogUrl}`,
    "",
    "WEEKLY HIGHLIGHTS",
    CHANGELOG_NEWSLETTER_WEEKLY_HIGHLIGHTS_EXPLAINER,
  ];
  if (payload.highlights.length === 0) {
    lines.push("- No highlights on this entry.");
  } else {
    for (const h of payload.highlights) lines.push(`- ${h}`);
  }
  lines.push("", "MORE YOU KNOW", CHANGELOG_NEWSLETTER_MORE_YOU_KNOW_EXPLAINER, "");
  for (const a of payload.articles) {
    lines.push(`- ${a.title} (${a.date})`);
    lines.push(`  ${a.summary}`);
    lines.push(`  ${a.whyItHelps}`);
    lines.push(`  ${a.sourceUrl}`);
  }
  lines.push("", "AISEO NEWS", CHANGELOG_NEWSLETTER_AISEO_NEWS_EXPLAINER, "");
  for (const a of payload.aiseoArticles) {
    lines.push(`- ${a.title} (${a.date})`);
    lines.push(`  ${a.summary}`);
    lines.push(`  ${a.whyItHelps}`);
    lines.push(`  ${a.sourceUrl}`);
  }
  lines.push("", "GOOGLE UPDATES", CHANGELOG_NEWSLETTER_GOOGLE_UPDATES_EXPLAINER, "");
  for (const a of payload.googleArticles) {
    lines.push(`- ${a.title} (${a.date})`);
    lines.push(`  ${a.summary}`);
    lines.push(`  ${a.whyItHelps}`);
    lines.push(`  ${a.sourceUrl}`);
  }
  lines.push("", "INDUSTRY NEWS", CHANGELOG_NEWSLETTER_INDUSTRY_NEWS_EXPLAINER, "");
  for (const a of payload.industryArticles) {
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
