import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export async function fetchWindowTreatmentsLivePrompt(): Promise<{
  livePrompt: string;
  updatedAt: string;
}> {
  const res = await fetch(backendApiUrl("/window-treatments-vertical/live-prompt"), {
    method: "GET",
    credentials: "include",
    headers: neoPulseApiHeaders(),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    livePrompt?: string;
    updatedAt?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Window treatments live prompt ${res.status}`);
  }
  return {
    livePrompt: typeof data.livePrompt === "string" ? data.livePrompt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

export function buildWindowTreatmentsRulesDownloadText(livePrompt: string): string {
  const body = livePrompt.trim();
  if (!body) {
    return "No window treatments rules yet.";
  }
  return `=== WINDOW TREATMENTS RULES ===\n${body}\n=== END WINDOW TREATMENTS RULES ===`;
}
