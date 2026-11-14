/**
 * Library card for the Semrush safe-fix agent (server cron + dashboard wrench).
 * Copy for title / meta / alt is produced on the hub via OpenRouter; this module
 * registers the agent id so Skills Library and the contract test stay complete.
 */

import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";

const inputSchema = z.object({
  siteId: z.string().optional(),
  issueKind: z.enum([
    "title",
    "meta_description",
    "missing_alt",
    "broken_internal_link",
    "broken_internal_image",
  ]),
  pageUrl: z.string().url(),
  excerpt: z.string().min(1),
});

const outputSchema = z.object({
  value: z.string().min(1),
});

export type SemrushSafeFixAgentInput = z.infer<typeof inputSchema>;
export type SemrushSafeFixAgentOutput = z.infer<typeof outputSchema>;

const SYSTEM = `You write one SEO field for a WordPress page from Semrush safe-fix.
Use only the page excerpt in the user message. No new claims. Never use the em dash.
Output JSON only: { "value": "..." }.
For title: 50-60 characters, Title Case, no brand prefix.
For meta_description: 130-150 characters.
For missing_alt: one short sentence describing the image.`;

export const semrushSafeFixAgent = createPulseAgent<
  SemrushSafeFixAgentInput,
  SemrushSafeFixAgentOutput
>({
  id: "reporting.semrush.safe-fix",
  label: "Semrush Safe Fix Agent",
  category: "meta",
  domain: "reporting",
  reason:
    "Applies no-approval Semrush Site Audit fixes (missing title/meta/alt, broken internal links and images) via Neo MCP, then rescans for HTTP 200.",
  inputSchema,
  outputSchema,
  temperature: 0.3,
  maxTokens: 512,
  buildSystemPrompt: () => SYSTEM,
  buildUserPrompt: (input) =>
    `Kind: ${input.issueKind}\nPage URL: ${input.pageUrl}\nSite id: ${input.siteId ?? ""}\n\nExcerpt:\n${input.excerpt}\n\nReturn JSON { "value": "..." }.`,
});
