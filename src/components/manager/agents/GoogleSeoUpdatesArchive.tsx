import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/ui";
import { cn } from "@/lib/utils";
import { SkillJsonLibrary } from "./SkillJsonLibrary";
import {
  fetchGoogleSeoArchive,
  generateGoogleSeoUpdates,
  type GoogleSeoArchiveEntry,
  type GoogleSeoArchiveState,
} from "@/lib/google-seo-updates/google-seo-live-prompt";

function byNewest(a: GoogleSeoArchiveEntry, b: GoogleSeoArchiveEntry): number {
  return b.date.localeCompare(a.date);
}

function formatDate(isoDate: string): string {
  return isoDate;
}

function withoutLinks(text: string): string {
  return text
    .replace(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

type YearSection = {
  date: string;
  title: string;
  body: string;
  rule: string;
};

const YEAR_ID = "__year__";

function yearCutoffIso(today = new Date()): string {
  const cutoff = new Date(today);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return cutoff.toISOString().slice(0, 10);
}

function yearOverview(entries: GoogleSeoArchiveEntry[], today = new Date()): YearSection[] {
  const cutoff = yearCutoffIso(today);
  const sections: YearSection[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.date < cutoff) continue;
    for (const item of entry.items) {
      const title = withoutLinks(item.title);
      const body = withoutLinks(item.whatChanged);
      const rule = withoutLinks(item.postRule);
      if (!title || body.length < 40) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push({ date: entry.date, title, body, rule });
    }
  }
  return sections;
}

export function GoogleSeoUpdatesArchive({
  skillLabel,
  onBack,
}: {
  skillLabel: string;
  onBack: () => void;
}): React.ReactElement {
  const [state, setState] = useState<GoogleSeoArchiveState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchGoogleSeoArchive();
      setState(next);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load archive.");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => [...(state?.entries ?? [])].sort(byNewest), [state]);

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || (selectedId !== YEAR_ID && !entries.some((e) => e.id === selectedId))) {
      setSelectedId(YEAR_ID);
    }
  }, [entries, selectedId]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  const yearSections = useMemo(() => yearOverview(entries), [entries]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generateGoogleSeoUpdates();
      setState(result.state);
      setSelectedId(result.entry.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Generate failed.");
    } finally {
      setGenerating(false);
    }
  }, []);

  const statusLine = loading
    ? "Loading archive..."
    : state?.lastRunError
      ? state.lastRunError
      : `${entries.length} dated entr${entries.length === 1 ? "y" : "ies"}`;

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
        <span className="ml-auto shrink-0 font-mono text-base text-muted-foreground">
          seo.google.updates
        </span>
        <button
          type="button"
          onClick={() => setShowSchema((open) => !open)}
          className="inline-flex h-8 shrink-0 items-center justify-center bg-zinc-900 px-3 text-base font-medium text-white hover:bg-ui-field"
        >
          {showSchema ? "Report" : "Schema"}
        </button>
      </div>

      {showSchema ? (
        <SkillJsonLibrary skillId="seo.google.updates" skillLabel={skillLabel} onBack={() => setShowSchema(false)} hideHeader />
      ) : null}

      <div className={showSchema ? "hidden" : "contents"}>

      {errorMessage ? (
        <div className="shrink-0 bg-zinc-900 px-4 py-2.5 text-base text-red-400">{errorMessage}</div>
      ) : null}

      <div className="flex h-11 shrink-0 items-center gap-2 bg-zinc-900 px-3">
        <span className="min-w-0 flex-1 truncate text-base tabular-nums text-muted-foreground">
          {statusLine}
        </span>
        <Button
          variant="run"
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating || loading}
        >
          <span className="inline-block w-[5rem] text-center">
            {generating ? "Writing" : "Generate"}
          </span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <aside
          className="flex w-56 shrink-0 flex-col overflow-hidden bg-zinc-950"
          aria-label="Google SEO archive by date"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedId(YEAR_ID)}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left",
                selectedId === YEAR_ID ? "bg-ui-field" : "bg-black hover:bg-ui-field/50",
              )}
            >
              <span className="text-base font-medium text-white">Overview</span>
            </button>
            {entries.length === 0 ? (
              <p className="px-3 py-3 text-base text-muted-foreground">
                No dated searches yet. Generate the first entry.
              </p>
            ) : (
              entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left",
                    selectedId === entry.id
                      ? "bg-ui-field"
                      : "bg-black hover:bg-ui-field/50",
                  )}
                >
                  <span className="text-base tabular-nums text-muted-foreground">
                    {formatDate(entry.date)}
                  </span>
                  <span className="text-base font-medium text-white">{entry.title}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto bg-black px-4 py-4" aria-label="Archive entry">
          {selectedId === YEAR_ID ? (
            <article className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-white">Overview</h3>
              </div>
              {yearSections.length === 0 ? (
                <p className="text-base text-muted-foreground">No reports in the last year yet.</p>
              ) : (
                yearSections.map((section) => (
                  <section key={`${section.date}-${section.title}`} className="flex flex-col gap-2">
                    <h4 className="text-base font-semibold text-white">
                      <span className="mr-2 font-normal tabular-nums text-muted-foreground">{section.date}</span>
                      {section.title}
                    </h4>
                    <p className="whitespace-pre-wrap text-base text-white">{section.body}</p>
                    {section.rule ? (
                      <p className="whitespace-pre-wrap text-base text-muted-foreground">{section.rule}</p>
                    ) : null}
                  </section>
                ))
              )}
            </article>
          ) : selectedEntry ? (
            <article className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-white">{selectedEntry.title}</h3>
                <p className="text-base tabular-nums text-muted-foreground">{selectedEntry.date}</p>
              </div>
              {selectedEntry.summary ? (
                <p className="whitespace-pre-wrap text-base text-white">{withoutLinks(selectedEntry.summary)}</p>
              ) : null}
              {selectedEntry.items.length === 0 && !selectedEntry.summary ? (
                <p className="text-base text-muted-foreground">No report in this search yet.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {selectedEntry.items.map((item) => (
                    <section key={item.title} className="flex flex-col gap-2">
                      <h4 className="text-base font-semibold text-white">{withoutLinks(item.title)}</h4>
                      <p className="whitespace-pre-wrap text-base text-white">{withoutLinks(item.whatChanged)}</p>
                      <p className="whitespace-pre-wrap text-base text-muted-foreground">{withoutLinks(item.postRule)}</p>
                    </section>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <p className="text-base text-muted-foreground">
              Nothing to read yet. Generate writes the first dated search.
            </p>
          )}
        </main>
      </div>
      </div>
    </div>
  );
}
