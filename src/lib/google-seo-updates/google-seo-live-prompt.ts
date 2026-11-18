import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type GoogleSeoArchiveItem = {
  publishedAt?: string;
  sourceUrl: string;
  title: string;
  whatChanged: string;
  postRule: string;
};

export type GoogleSeoArchiveEntry = {
  id: string;
  date: string;
  title: string;
  summary?: string;
  sourcesChecked: string[];
  items: GoogleSeoArchiveItem[];
};

export type GoogleSeoArchiveState = {
  entries: GoogleSeoArchiveEntry[];
  livePrompt: string;
  updatedAt: string;
  lastRunKey: string;
  lastRunError: string;
};

export async function fetchGoogleSeoArchive(): Promise<GoogleSeoArchiveState> {
  const res = await fetch(backendApiUrl("/google-seo-updates/archive"), {
    method: "GET",
    credentials: "include",
    headers: neoPulseApiHeaders(),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    state?: GoogleSeoArchiveState;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.state) {
    throw new Error(data.error ?? `Google SEO archive ${res.status}`);
  }
  return data.state;
}

export async function fetchGoogleSeoLivePrompt(): Promise<{
  livePrompt: string;
  updatedAt: string;
}> {
  const res = await fetch(backendApiUrl("/google-seo-updates/live-prompt"), {
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
    throw new Error(data.error ?? `Google SEO live prompt ${res.status}`);
  }
  return {
    livePrompt: typeof data.livePrompt === "string" ? data.livePrompt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

export async function generateGoogleSeoUpdates(): Promise<{
  entry: GoogleSeoArchiveEntry;
  state: GoogleSeoArchiveState;
}> {
  const res = await fetch(backendApiUrl("/google-seo-updates/generate"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    entry?: GoogleSeoArchiveEntry;
    state?: GoogleSeoArchiveState;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.entry || !data.state) {
    throw new Error(data.error ?? `Generate failed (${res.status})`);
  }
  return { entry: data.entry, state: data.state };
}

export function buildGoogleSeoRulesDownloadText(livePrompt: string): string {
  const body = livePrompt.trim();
  if (!body) {
    return "No Google SEO rules yet.";
  }
  return `=== GOOGLE SEO RULES ===\n${body}\n=== END GOOGLE SEO RULES ===`;
}
