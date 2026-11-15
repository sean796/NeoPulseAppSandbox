export function formatUpstreamResearchFactsUserBlock(facts: string): string {
  const trimmed = facts.trim();
  if (!trimmed) return "";
  return [
    "MANDATORY SOURCE FACTS (previous agent / CSV research).",
    "Use these facts in the article.",
    "Do not invent facts that are not in this block.",
    "Do not omit neighborhood-specific details, FAQs, proof, or competitors named here.",
    "",
    trimmed,
  ].join("\n");
}

export function applyUpstreamContextToPostCreatorPayload<
  T extends {
    useUpstreamContext?: boolean;
    workflowContextBlock?: string;
    prefilledImportRows?: Array<{ prompt_modifier?: string; seo_research?: string }>;
    optionalPrompt?: string;
  },
>(payload: T): T {
  if (payload.useUpstreamContext !== true) return payload;
  const rows = payload.prefilledImportRows;
  if (Array.isArray(rows) && rows.length > 0) {
    const nextRows = rows.map((row) => {
      if (row.prompt_modifier?.trim()) return row;
      const facts = formatUpstreamResearchFactsUserBlock(
        row.seo_research?.trim() || payload.workflowContextBlock || "",
      );
      if (!facts) return row;
      return { ...row, prompt_modifier: facts };
    });
    return { ...payload, prefilledImportRows: nextRows };
  }
  const facts = formatUpstreamResearchFactsUserBlock(payload.workflowContextBlock || "");
  if (!facts) return payload;
  const optionalPrompt = [payload.optionalPrompt?.trim(), facts].filter(Boolean).join("\n\n");
  return { ...payload, optionalPrompt: optionalPrompt || payload.optionalPrompt };
}