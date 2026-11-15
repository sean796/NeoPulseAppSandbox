import type { AgentConfig } from "@/types/agent-config";
import { featureIsExplicitFaqMarker } from "@/lib/content-generation/faq-heading-policy";
import { extractChecklistItemTitle } from "@/lib/post-creator/post-creator-checklist-post-process";

/**
 * Canonical outline for bulk “middle-out” harness generation.
 * Section titles and order come **only** from the task-specific blueprint (`AgentConfig[]`)
 * produced by `generateBlueprintFromTemplate` (or flow-freeform conversion)—never from fixed H2 lists
 * used elsewhere (e.g. local strategy proposal reports).
 */
export type BulkHarnessOutlineSection = {
  index: number;
  /** Raw agent title from blueprint (may differ from display title for FAQ). */
  title: string;
  /** Heading text this section must use in output (matches `generateSingleSectionPrompt` / FAQ rules). */
  displayTitle: string;
  description: string;
  headingLevel: number;
  isFaq: boolean;
  agent: AgentConfig;
};

export function agentHasIllustrativeFeature(agent: { features?: string[] }): boolean {
  return (
    agent.features?.some((f) => {
      const s = typeof f === "string" ? f.toLowerCase().trim() : "";
      return s.startsWith("[illustrative]");
    }) ?? false
  );
}

export function agentHasFaqFeature(agent: AgentConfig): boolean {
  return agent.features?.some((f) => typeof f === "string" && featureIsExplicitFaqMarker(f)) ?? false;
}

export function buildBulkHarnessOutlineFromAgents(agents: AgentConfig[]): BulkHarnessOutlineSection[] {
  return agents.map((agent, index) => {
    const isFaq = agentHasFaqFeature(agent);
    const rawTitle = isFaq ? "FAQ" : extractChecklistItemTitle(agent.title?.trim() || "");
    const resolvedTitle = rawTitle;
    return {
      index,
      title: resolvedTitle,
      displayTitle: resolvedTitle,
      description: agent.description ?? "",
      headingLevel: agent.headingLevel ?? 1,
      isFaq,
      agent: isFaq ? agent : { ...agent, title: resolvedTitle },
    };
  });
}

/** Join per-section HTML fragments in harness order (no H1; first fragment should open with this row's first H2). */
export function stitchHarnessSections(sectionHtmlPieces: string[]): string {
  return sectionHtmlPieces
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Short numbered list for harness user prompts (titles + truncated intent). */
export function formatOutlineTitlesForHarnessPrompt(outline: BulkHarnessOutlineSection[]): string {
  return outline
    .map((o, i) => {
      const intent = o.description.trim();
      const oneLine = intent.length > 220 ? `${intent.slice(0, 220)}…` : intent;
      return `${i + 1}. ${o.displayTitle}${oneLine ? ` — ${oneLine}` : ""}`;
    })
    .join("\n");
}

export { formatPressReleaseOutlineForHarnessPrompt } from "@/lib/press-release/press-release-harness-prompts";
