import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";

export type StudioEditorModeId =
  | "prompt"
  | "blog-import"
  | "vertical-benchmarks"
  | "press-release";

export type StudioEditorModeOption = {
  id: StudioEditorModeId;
  label: string;
};

export const STUDIO_EDITOR_MODE_OPTIONS: readonly StudioEditorModeOption[] = [
  { id: "prompt", label: "Blog Ideas Studio" },
  { id: "blog-import", label: "Import Studio" },
  { id: "vertical-benchmarks", label: "Industry Verticals Studio" },
  { id: "press-release", label: "Press Release Studio" },
] as const;

export const STUDIO_EDITOR_MODE_STORAGE_KEY = "neo-pulse:studio-editor-mode:v1";

export function isStudioEditorModeId(value: string): value is StudioEditorModeId {
  return STUDIO_EDITOR_MODE_OPTIONS.some((opt) => opt.id === value);
}

export function readStoredStudioEditorMode(
  activeSection?: BlogGeneratorSectionId,
): StudioEditorModeId {
  if (activeSection === "bulk-press-release") return "press-release";
  if (activeSection === "bulk-csv" || activeSection === "bulk-blog-import") return "blog-import";
  try {
    const raw = sessionStorage.getItem(STUDIO_EDITOR_MODE_STORAGE_KEY);
    if (raw === "csv") return "blog-import";
    if (raw && isStudioEditorModeId(raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "prompt";
}

export function writeStoredStudioEditorMode(mode: StudioEditorModeId): void {
  try {
    sessionStorage.setItem(STUDIO_EDITOR_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function blogGeneratorSectionForStudioMode(
  mode: StudioEditorModeId,
): BlogGeneratorSectionId {
  if (mode === "press-release") return "bulk-press-release";
  return "bulk-prompt";
}
