import type { WordPressSite } from "@/components/integrations/types";
import type { BrowserTargetUrlSource, TaskExecutionPayload } from "@/lib/tasks-types";
import { outputMatchesRagVariableKey } from "@/lib/rag-variable-key-match";
import type { AgentRunStepOutputSnapshot } from "@/lib/agent-runs/step-output-types";

export type BrowserSiteSource = Pick<WordPressSite, "name" | "siteUrl" | "productionSiteUrl"> | null | undefined;

export type ResolveBrowserTargetContext = {
  outputs?: AgentRunStepOutputSnapshot[];
  siteId?: string;
  clientSiteIds?: string[];
};

function normalizeBrowserTargetUrlSource(
  source: BrowserTargetUrlSource | string | undefined,
): BrowserTargetUrlSource {
  const normalized = String(source ?? "manual").trim();
  if (normalized === "client_site" || normalized === "variable") return normalized;
  return "manual";
}

export function browserAutomationRequiresClient(payload?: TaskExecutionPayload | null): boolean {
  const source = normalizeBrowserTargetUrlSource(payload?.targetUrlSource);
  return source === "client_site" || source === "variable";
}

function parseHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractUrlFromStepOutput(output: AgentRunStepOutputSnapshot): string | null {
  const previewUrl = parseHttpUrl(output.textPreview ?? "");
  if (previewUrl) return previewUrl;

  for (const file of output.fileRefs ?? []) {
    const fileUrl = parseHttpUrl(String(file.url ?? ""));
    if (fileUrl) return fileUrl;
  }

  return null;
}

function siteUrlFromSite(site: BrowserSiteSource): string {
  return String(site?.siteUrl ?? site?.productionSiteUrl ?? "").trim();
}

function resolveVariableTargetUrl(
  payload: TaskExecutionPayload,
  context?: ResolveBrowserTargetContext,
): string {
  const variableKey = String(payload.targetUrlVariable ?? "").trim();
  if (!variableKey) {
    throw new Error("Select an upstream variable for the browser target URL.");
  }

  const outputs = context?.outputs ?? [];
  const siteId = context?.siteId?.trim() ?? "";
  const clientSiteIds = context?.clientSiteIds ?? [];

  const matches = outputs.filter(
    (output) =>
      output.scope === "run" &&
      outputMatchesRagVariableKey(output, variableKey, siteId, clientSiteIds),
  );

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const url = extractUrlFromStepOutput(matches[index]!);
    if (url) return url;
  }

  throw new Error(`No URL found in upstream variable {{${variableKey}}}.`);
}

function substituteClientUrlToken(value: string, clientUrl: string): string {
  if (!clientUrl.trim()) return value;
  return value.split("{{client_url}}").join(clientUrl);
}

export function resolveBrowserTargetUrl(
  payload: TaskExecutionPayload,
  site?: BrowserSiteSource,
  context?: ResolveBrowserTargetContext,
): string {
  const source = normalizeBrowserTargetUrlSource(payload.targetUrlSource);
  const clientUrl = siteUrlFromSite(site);

  if (source === "client_site") {
    if (!clientUrl) {
      throw new Error("Client site URL is missing. Set a client before running.");
    }
    return clientUrl;
  }

  if (source === "variable") {
    return resolveVariableTargetUrl(payload, context);
  }

  const manualUrl = substituteClientUrlToken(String(payload.targetUrl ?? ""), clientUrl).trim();
  if (!manualUrl) {
    throw new Error("Set a target URL before running browser automation.");
  }

  const parsed = parseHttpUrl(manualUrl);
  if (!parsed) {
    throw new Error("Target URL must be a valid http or https URL.");
  }
  return parsed;
}

export function browserAutomationIsConfigured(payload?: TaskExecutionPayload | null): boolean {
  const instructions = payload?.browserInstructionsHtml?.trim();
  if (!instructions) return false;

  const source = normalizeBrowserTargetUrlSource(payload?.targetUrlSource);
  if (source === "client_site") return true;
  if (source === "variable") return Boolean(payload?.targetUrlVariable?.trim());
  return Boolean(payload?.targetUrl?.trim());
}

export function browserInstructionsForJob(html: string, contextBlock?: string): string {
  const block = contextBlock?.trim();
  if (!block) return html;
  const escaped = block
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `${html}\n<hr data-workflow-context="1" />\n<pre>${escaped}</pre>`;
}
