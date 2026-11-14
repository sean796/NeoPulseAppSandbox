import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type SkillsLibraryFileName = "schema.json" | "prompts.json" | "evals.json";

export type SkillsLibraryFiles = Record<SkillsLibraryFileName, Record<string, unknown>>;

export interface SkillsLibraryPayload {
  ok: boolean;
  skillId: string;
  files: SkillsLibraryFiles;
  error?: string;
}

/** Path slug without dots (WP API paths truncate after `.`). */
export function skillsLibraryPathSlug(skillId: string): string {
  if (skillId === "reporting.semrush.safe-fix") return "semrush-safe-fix";
  return skillId.replace(/\./g, "-");
}

export async function fetchSkillLibrary(skillId: string): Promise<SkillsLibraryPayload> {
  const slug = skillsLibraryPathSlug(skillId);
  const res = await fetch(backendApiUrl(`/skills-library/${encodeURIComponent(slug)}`), {
    method: "GET",
    credentials: "include",
    headers: neoPulseApiHeaders(),
  });
  const data = (await res.json()) as SkillsLibraryPayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Skills Library ${res.status}`);
  }
  return data;
}

export async function saveSkillLibraryFile(
  skillId: string,
  file: Exclude<SkillsLibraryFileName, "schema.json">,
  document: Record<string, unknown>,
): Promise<SkillsLibraryPayload> {
  const slug = skillsLibraryPathSlug(skillId);
  const res = await fetch(
    backendApiUrl(`/skills-library/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`),
    {
      method: "PUT",
      credentials: "include",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ document }),
    },
  );
  const data = (await res.json()) as SkillsLibraryPayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Save failed (${res.status})`);
  }
  return data;
}
