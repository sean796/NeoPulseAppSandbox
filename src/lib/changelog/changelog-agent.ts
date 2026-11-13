/**
 * OpenRouter agent (research category): turns a pack of git commits into
 * one reader-friendly changelog entry for the Neo Pulse web app.
 *
 * The commit pack is the only allowed source of facts. Dates, ranges, and
 * commit counts are owned by code; the model writes only the words.
 */

import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";

export const changelogCommitSchema = z.object({
  hash: z.string().min(1),
  date: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().default(""),
  files: z.array(z.string()).default([]),
});

export type ChangelogCommit = z.infer<typeof changelogCommitSchema>;

export const changelogDraftSchema = z.object({
  title: z.string().min(1),
  highlights: z.array(z.string().min(1)).default([]),
  sections: z.array(
    z.object({
      heading: z.string().min(1),
      items: z.array(z.string().min(1)),
    }),
  ),
});

export type ChangelogDraft = z.infer<typeof changelogDraftSchema>;

const changelogInputSchema = z.object({
  commits: z.array(changelogCommitSchema).min(1).max(500),
  coveredThrough: z.string().nullable().default(null),
});

export type ChangelogAgentInput = z.infer<typeof changelogInputSchema>;

export const CHANGELOG_WRITER_MODEL = "deepseek/deepseek-v4.1-flash";

export const CHANGELOG_WRITER_SYSTEM = `You write one weekly changelog entry for Neo Pulse for everyday people who USE the program (agency owners and staff). Not engineers.

Grounding rules (non-negotiable):
- The commit pack in the user message is the FULL WEEK of commits. It is the ONLY source of facts.
- Summarize the ENTIRE week. Recency bias is forbidden. Earlier-week ships can outrank today's commits.
- Never invent dates, counts, or version numbers.
- Do NOT write an intro paragraph or summary.
- This is a WEEKLY HIGHLIGHTS entry of the week's MOST SIGNIFICANT product features users can open and use.

What counts as significant (rank these first):
- New or changed screens (Changelog with archive, draft approval, weekly due flag)
- Integrations / add-client / Google Business Profile leads / Organic Website Leads
- Keys screen: paste your AI key and Pulse starts using it as you type
- Workspace links that open the page you clicked
- Client reports that still show every section that loaded when one feed is quiet

Banned from highlights / title (never lead with these, even if many commits say them):
- This newsletter itself, AgentMail sends, AISEO News / Google Updates email sections, weekly-highlights format tweaks, email palette / wire-seed / setup-key fixes
- Changelog-about-changelog / Friday auto-send meta about the email itself
- Hub, deploy, Wave / audit / grade / CI / Storybook / evals / "ownable" / module splits
- Tiny renames, test-only tweaks, flatten/push ops, doc-only commits

- Include a "highlights" array with ONLY the 3 to 5 most significant weekly wins. Each bullet a FULL sentence naming the screen or feature and what the user can do.
- Group only those top wins using "New", "Improved", "Fixed" when needed (max 2 to 4 bullets per section).
- No fluff, no raw file paths, no engineer jargon.
- Never use the em dash character. Use commas, periods, or parentheses instead.

Output (JSON only, no markdown fences, no commentary before or after):
{
  "title": "Short weekly title naming the main user-facing feature theme (max 12 words)",
  "highlights": ["One full sentence naming a screen or feature and the user outcome"],
  "sections": [{ "heading": "New", "items": ["One full sentence per top win"] }]
}`;

function buildUserPrompt(input: ChangelogAgentInput): string {
  const lines = input.commits.map((c) => {
    const files = c.files.length > 0 ? ` [files: ${c.files.slice(0, 8).join(", ")}]` : "";
    const body = c.body.trim() ? `\n  ${c.body.trim().replace(/\s+/g, " ").slice(0, 400)}` : "";
    return `- ${c.date} ${c.subject}${files}${body}`;
  });
  const from = input.commits[0]?.date ?? "";
  const to = input.commits[input.commits.length - 1]?.date ?? "";
  return `Covered period: ${from} to ${to} (${input.commits.length} commits). Previous archive coverage ended: ${input.coveredThrough ?? "never (first entry)"}.

Commit pack (oldest first):
${lines.join("\n")}

Write the weekly highlights changelog JSON now.
Cover the ENTIRE week pack. Pick the 3 to 5 MOST SIGNIFICANT product wins for a CEO.
Do not write about the changelog newsletter, AgentMail, or email section tweaks.
Do not fixate on the newest commits.`;
}

export function buildChangelogWriterUserPrompt(input: ChangelogAgentInput): string {
  return buildUserPrompt(input);
}

export const appChangelogWriterAgent = createPulseAgent<ChangelogAgentInput, ChangelogDraft>({
  id: "reporting.changelog.app-update-log",
  label: "App Changelog Writer",
  category: "research",
  domain: "reporting",
  reason:
    "Turns this week's git commits into a short plain-language Neo Pulse weekly highlights entry (most significant wins only).",
  inputSchema: changelogInputSchema,
  outputSchema: changelogDraftSchema,
  temperature: 0.3,
  maxTokens: 4096,
  buildSystemPrompt: () => CHANGELOG_WRITER_SYSTEM,
  buildUserPrompt: (input) => buildUserPrompt(input),
  parseOutput: (rawContent) => {
    const start = rawContent.indexOf("{");
    const end = rawContent.lastIndexOf("}");
    const jsonSlice = start >= 0 && end > start ? rawContent.slice(start, end + 1) : rawContent;
    return JSON.parse(jsonSlice) as ChangelogDraft;
  },
});

/**
 * Build the archive entry around a model draft. Code owns every fact:
 * the entry date, the covered range, and the commit count come from the
 * pack and the clock, never from the model. Each call gets a new id so
 * Generate adds a dated report and leaves earlier reports in the archive.
 */
export function buildChangelogEntry(
  draft: ChangelogDraft,
  commits: ChangelogCommit[],
  entryDate: string,
): {
  id: string;
  date: string;
  rangeFrom: string;
  rangeTo: string;
  commitCount: number;
  title: string;
  highlights: string[];
  sections: { heading: string; items: string[] }[];
} {
  const rangeFrom = commits[0]?.date ?? entryDate;
  const rangeTo = commits[commits.length - 1]?.date ?? entryDate;
  return {
    id: `${entryDate}-${crypto.randomUUID()}`,
    date: entryDate,
    rangeFrom,
    rangeTo,
    commitCount: commits.length,
    title: draft.title,
    highlights: [...(draft.highlights ?? [])],
    sections: draft.sections.map((section) => ({
      heading: section.heading,
      items: [...section.items],
    })),
  };
}
