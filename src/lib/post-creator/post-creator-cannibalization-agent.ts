import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { openRouterMaxOutputTokens } from "@/lib/openrouter-stream-token-limits";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { parsePostCreatorCannibalizationJson } from "@/lib/post-creator/post-creator-cannibalization-parse";
import {
  executePostCreatorCannibalTool,
  POST_CREATOR_CANNIBAL_TOOLS,
  type PostCreatorCannibalToolName,
  type PostCreatorInventoryCatalog,
} from "@/lib/post-creator/post-creator-cannibalization-tools";
import type { PostCreatorRowReviewEntry } from "@/lib/post-creator/post-creator-inventory-gate";
import { buildInventoryCannibalPromptBlock } from "@/lib/vertical-benchmark/vertical-benchmark-inventory-cannibal";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

const CANNIBAL_SYSTEM = `You are a senior SEO strategist reviewing proposed NEW blog posts before upload.

Read the full SITE_INVENTORY (every slug, title, URL). Block any proposed row that would cannibalize existing coverage: same search intent, same topic cluster, near-duplicate angle, or light rephrase of an existing title/keyword.

Allow only net-new search intents or clearly complementary topics that do not compete with inventory.

Use lookup tools when you need to verify overlap. Return final JSON: {"decisions":[{"rowIndex":0,"allow":true,"reason":"string","conflictingUrl":"optional url"}]}`;

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

function buildProposedCatalog(rows: CSVRow[]): unknown[] {
  return rows.map((row, rowIndex) => ({
    rowIndex,
    keyword: row.keyword?.trim() || "",
    title: row.title?.trim() || "",
  }));
}

async function callWithTools(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<{
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}> {
  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    signal: args.signal,
    headers: openRouterWebAppHeaders(args.apiKey),
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      tools: POST_CREATOR_CANNIBAL_TOOLS,
      temperature: 0.1,
      max_tokens: openRouterMaxOutputTokens(),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenRouter cannibalization agent failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
      };
    }>;
  };

  const message = data.choices?.[0]?.message;
  const toolCalls = message?.tool_calls?.map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }));
  return { content: message?.content?.trim() ?? "", toolCalls };
}

export async function runPostCreatorCannibalizationAgent(args: {
  apiKey: string;
  model?: string;
  catalog: PostCreatorInventoryCatalog;
  inventoryJson: string;
  rows: CSVRow[];
  signal?: AbortSignal;
}): Promise<Map<number, { allow: boolean; reason: string; conflictingUrl?: string }>> {
  const decisions = new Map<number, { allow: boolean; reason: string; conflictingUrl?: string }>();
  if (args.rows.length === 0) return decisions;

  for (let i = 0; i < args.rows.length; i++) {
    decisions.set(i, { allow: true, reason: "Pending AI review" });
  }

  const inventoryBlock = buildInventoryCannibalPromptBlock(args.inventoryJson);
  const model = args.model ?? getResearchModel();
  const messages: ChatMessage[] = [
    { role: "system", content: CANNIBAL_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        task: "post_creator_cannibalization_review",
        siteInventory: inventoryBlock,
        proposedRows: buildProposedCatalog(args.rows),
        inventoryRowCount: args.catalog.rows.length,
        instructions:
          "Read every inventory slug and title. Return one decision per rowIndex. Block semantic overlap, not just exact slug matches.",
      }),
    },
  ];

  const maxRounds = 6;
  for (let round = 0; round < maxRounds; round++) {
    const response = await callWithTools({ apiKey: args.apiKey, model, messages, signal: args.signal });

    if (response.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: response.content || null,
        tool_calls: response.toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      });

      for (const call of response.toolCalls) {
        let parsedArgs: { query?: string } = {};
        try {
          parsedArgs = JSON.parse(call.arguments) as { query?: string };
        } catch {
          parsedArgs = {};
        }
        const toolName = call.name as PostCreatorCannibalToolName;
        const hits = executePostCreatorCannibalTool(args.catalog, toolName, parsedArgs);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ matches: hits.slice(0, 8) }),
        });
      }
      continue;
    }

    const parsed = parsePostCreatorCannibalizationJson(response.content);
    if (parsed.length > 0) {
      for (const decision of parsed) {
        decisions.set(decision.rowIndex, {
          allow: decision.allow,
          reason: decision.reason,
          conflictingUrl: decision.conflictingUrl,
        });
      }
      return decisions;
    }

    if (response.content) break;
  }

  const fallback = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system: CANNIBAL_SYSTEM,
    user: JSON.stringify({
      task: "post_creator_cannibalization_final_json",
      siteInventory: inventoryBlock,
      proposedRows: buildProposedCatalog(args.rows),
      note: "Return JSON only: { decisions: [{ rowIndex, allow, reason, conflictingUrl? }] }",
    }),
    maxTokens: openRouterMaxOutputTokens(),
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });

  for (const decision of parsePostCreatorCannibalizationJson(fallback.content)) {
    decisions.set(decision.rowIndex, {
      allow: decision.allow,
      reason: decision.reason,
      conflictingUrl: decision.conflictingUrl,
    });
  }

  return decisions;
}

export function applyCannibalDecisions(
  rows: PostCreatorRowReviewEntry[],
  decisions: Map<number, { allow: boolean; reason: string; conflictingUrl?: string }>,
): PostCreatorRowReviewEntry[] {
  return rows.map((entry) => {
    const decision = decisions.get(entry.rowIndex);
    if (!decision || decision.allow) return entry;
    return {
      ...entry,
      status: "blocked",
      reason: decision.reason,
      conflictingUrl: decision.conflictingUrl,
    };
  });
}

export type PostCreatorBlockedRow = {
  keyword: string;
  reason: string;
  conflictingUrl?: string;
};

export function blockedRowsFromReview(results: PostCreatorRowReviewEntry[]): PostCreatorBlockedRow[] {
  return results
    .filter((entry) => entry.status === "blocked")
    .map((entry) => ({
      keyword: entry.row.keyword?.trim() || entry.row.title?.trim() || `row ${entry.rowIndex + 1}`,
      reason: entry.reason,
      conflictingUrl: entry.conflictingUrl,
    }));
}

export function approvedRowsFromReview(results: PostCreatorRowReviewEntry[]): CSVRow[] {
  return results.filter((entry) => entry.status === "ok").map((entry) => entry.row);
}

/** @deprecated Use blockedRowsFromReview */
export const blockedRowsFromGate = blockedRowsFromReview;

/** @deprecated Use approvedRowsFromReview */
export const approvedRowsFromGate = approvedRowsFromReview;
