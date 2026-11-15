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

export const changelogPriorEntrySchema = z.object({
  title: z.string().min(1),
  highlights: z.array(z.string()).default([]),
});

export type ChangelogPriorEntry = z.infer<typeof changelogPriorEntrySchema>;

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
  priorEntries: z.array(changelogPriorEntrySchema).default([]),
});

export type ChangelogAgentInput = z.infer<typeof changelogInputSchema>;

export const CHANGELOG_WRITER_MODEL = "deepseek/deepseek-v4.1-flash";

export const CHANGELOG_WRITER_SYSTEM = `You write one weekly changelog entry for Neo Pulse for everyday people who USE the program (agency owners and staff). Not engineers.

Grounding rules (non-negotiable):
- The commit pack in the user message is THIS WEEK's uncovered work only. It is the ONLY source of facts.
- Write about what is NEW in this pack. Prefer the newest dates and the biggest user-facing ships (Skills, Properties / profile, Assist, Studios, schedule controls, etc.).
- Never invent dates, counts, or version numbers.
- Do NOT write an intro paragraph or summary.

Non-repetition (non-negotiable):
- The user message lists PRIOR changelog entries already published. Do NOT reuse their titles, themes, or bullets. If Pulse Host, My Sites, hosted WordPress users, client report share links, or OpenRouter keys already appear in prior entries, they are BANNED for this entry even if old commits remain in the pack.
- Each user-facing win appears ONCE in the whole JSON. Never copy the same bullet into Highlights and New and Improved and Fixed.
- highlights = the 3 to 5 top wins (unique full sentences).
- sections = partition those wins into "New", "Improved", and/or "Fixed" (omit empty headings). Max 2 to 4 items per section. Every section item must be a DISTINCT sentence from every highlight and from every other section item. Never paste the Highlights list again under New/Improved/Fixed.

Banned from title and bullets (never lead with these):
- This newsletter itself, AgentMail, AISEO News / Google Updates email sections, weekly-highlights format tweaks, email palette / wire-seed / setup-key fixes
- Changelog-about-changelog / Friday auto-send meta
- Hub, deploy, Wave / audit / grade / CI / Storybook / evals / "ownable" / module splits / flatten/push / doc-only / test-only
- Tiny renames and engineer-only cleanup

- Title: short weekly title naming THIS pack's main new theme (max 12 words). Not a prior-entry title.
- No fluff, no raw file paths, no engineer jargon.
- Never use the em dash character. Use commas, periods, or parentheses instead.

Output (JSON only, no markdown fences, no commentary before or after):
{
  "title": "Short weekly title naming the main NEW user-facing theme (max 12 words)",
  "highlights": ["One full sentence naming a screen or feature and the user outcome"],
  "sections": [{ "heading": "New", "items": ["Distinct sentence for a New win only"] }]
}`;

function formatPriorBlock(priorEntries: ChangelogPriorEntry[]): string {
  if (priorEntries.length === 0) {
    return "Prior archive entries: none yet.";
  }
  const lines = priorEntries.map((e, i) => {
    const highs =
      e.highlights.length > 0
        ? e.highlights
            .slice(0, 6)
            .map((h) => `    - ${h}`)
            .join("\n")
        : "    (no highlights stored)";
    return `${i + 1}. Title: ${e.title}\n${highs}`;
  });
  return `Prior archive entries (ALREADY PUBLISHED, do not repeat themes or bullets):\n${lines.join("\n")}`;
}

function buildUserPrompt(input: ChangelogAgentInput): string {
  const lines = input.commits.map((c) => {
    const files = c.files.length > 0 ? ` [files: ${c.files.slice(0, 8).join(", ")}]` : "";
    const body = c.body.trim() ? `\n  ${c.body.trim().replace(/\s+/g, " ").slice(0, 400)}` : "";
    return `- ${c.date} ${c.subject}${files}${body}`;
  });
  const from = input.commits[0]?.date ?? "";
  const to = input.commits[input.commits.length - 1]?.date ?? "";
  return `${formatPriorBlock(input.priorEntries)}

Covered period for THIS pack: ${from} to ${to} (${input.commits.length} commits). Previous coverage marker: ${input.coveredThrough ?? "never (first entry)"}.

Commit pack (oldest first). These commits are NOT yet in the archive:
${lines.join("\n")}

Write the weekly highlights changelog JSON now.
Lead with the NEWEST significant product work in this pack (Skills, profile, Properties, Assist, studios, schedules, and similar user surfaces).
Do not repeat prior archive themes. Do not duplicate the same bullet across Highlights and every section.
Do not write about the changelog newsletter, AgentMail, or email section tweaks.`;
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
    "Turns this week's uncovered git commits into a short plain-language Neo Pulse weekly highlights entry that does not repeat prior archive themes.",
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
  commitHashes: string[];
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
    commitHashes: commits.map((c) => c.hash),
    title: draft.title,
    highlights: [...(draft.highlights ?? [])],
    sections: draft.sections.map((section) => ({
      heading: section.heading,
      items: [...section.items],
    })),
  };
}
