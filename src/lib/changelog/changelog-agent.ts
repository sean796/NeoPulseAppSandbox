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

export const CHANGELOG_WRITER_SYSTEM = `You write one weekly changelog entry for the Neo Pulse web app, for the agency owner.

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

Write the weekly highlights changelog JSON now. Most significant wins only.`;
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
