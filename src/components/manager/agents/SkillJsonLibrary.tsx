import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSkillLibrary,
  saveSkillLibraryFile,
  type SkillsLibraryFileName,
  type SkillsLibraryFiles,
} from "@/lib/skills-library/skills-library-api";
import { cn } from "@/lib/utils";

const FILE_ORDER: SkillsLibraryFileName[] = ["schema.json", "prompts.json", "evals.json"];

const EDITABLE = new Set<SkillsLibraryFileName>(["prompts.json", "evals.json"]);

export function SkillJsonLibrary({
  skillId,
  skillLabel,
  onBack,
}: {
  skillId: string;
  skillLabel: string;
  onBack: () => void;
}): React.ReactElement {
  const [files, setFiles] = useState<SkillsLibraryFiles | null>(null);
  const [activeFile, setActiveFile] = useState<SkillsLibraryFileName>("schema.json");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchSkillLibrary(skillId);
      setFiles(payload.files);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load skill library.");
      setFiles(null);
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!files) {
      setDraft("");
      return;
    }
    setDraft(JSON.stringify(files[activeFile], null, 2));
    setErrorMessage(null);
  }, [files, activeFile]);

  const readOnly = !EDITABLE.has(activeFile);

  const canSave = useMemo(() => {
    if (readOnly || !files || saving) return false;
    try {
      JSON.parse(draft);
      return true;
    } catch {
      return false;
    }
  }, [draft, files, readOnly, saving]);

  const handleSave = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Document must be a JSON object");
      }
      const payload = await saveSkillLibraryFile(
        skillId,
        activeFile as Exclude<SkillsLibraryFileName, "schema.json">,
        parsed,
      );
      setFiles(payload.files);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [activeFile, draft, readOnly, skillId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 shrink-0 items-center justify-center bg-black px-3 text-base font-medium text-white hover:bg-primary hover:text-black"
        >
          Skills
        </button>
        <span className="min-w-0 truncate text-base font-semibold text-white">{skillLabel}</span>
        <span className="ml-auto shrink-0 font-mono text-base text-muted-foreground">{skillId}</span>
      </div>

      {errorMessage ? (
        <div className="shrink-0 bg-zinc-900 px-4 py-2.5 text-base text-red-400">{errorMessage}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <nav
          className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto"
          aria-label="Skill JSON files"
        >
          {FILE_ORDER.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => setActiveFile(file)}
              className={cn(
                "h-8 w-full truncate bg-black px-3 text-left font-mono text-base",
                activeFile === file ? "text-white" : "text-muted-foreground hover:text-white",
              )}
              aria-current={activeFile === file ? "page" : undefined}
            >
              {file}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex h-8 shrink-0 items-center gap-2">
            <span className="font-mono text-base text-muted-foreground">{activeFile}</span>
            {readOnly ? (
              <span className="text-base text-muted-foreground">read-only</span>
            ) : (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void handleSave()}
                className="ml-auto inline-flex h-8 shrink-0 items-center justify-center bg-black px-3 text-base font-medium text-white hover:bg-primary hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black disabled:hover:text-white"
              >
                {saving ? "Saving" : "Save"}
              </button>
            )}
          </div>
          {loading ? (
            <div className="min-h-0 flex-1 bg-zinc-900 px-4 py-3 text-base text-muted-foreground">
              Loading…
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={readOnly}
              spellCheck={false}
              aria-label={activeFile}
              className={cn(
                "min-h-0 flex-1 resize-none bg-zinc-900 px-4 py-3 font-mono text-base text-white outline-none",
                "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
                readOnly && "text-muted-foreground",
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
