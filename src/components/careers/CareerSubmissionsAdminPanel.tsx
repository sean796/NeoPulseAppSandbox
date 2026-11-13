import React, { useCallback, useEffect, useState } from "react";
import { Briefcase, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/ui";
import { CAREER_APPLICATION_QUESTIONS } from "@/components/careers/career-role-data";
import {
  fetchCareerSubmissions,
  type CareerSubmissionRecord,
} from "@/lib/careers/careers-api";
import { cn } from "@/lib/utils";

export function CareerSubmissionsAdminPanel(): React.ReactElement {
  const [submissions, setSubmissions] = useState<CareerSubmissionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCareerSubmissions();
      setSubmissions(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applicant submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selected =
    submissions.find((s) => s.id === selectedId) ?? submissions[0] ?? null;

  return (
    <section className="flex flex-col gap-3 bg-zinc-950 p-4 text-base text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="text-base font-semibold text-white">
            Operator / Developer Applicant Submissions
          </h3>
          <span className="bg-zinc-900 px-2 py-0.5 text-base tabular-nums text-muted-foreground">
            {submissions.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/apply"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 bg-zinc-900 px-3 text-base text-zinc-200 hover:bg-zinc-800"
          >
            <span>Open /apply</span>
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
          <Button
            variant="quiet"
            type="button"
            disabled={loading}
            onClick={() => void loadList()}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            <span className="inline-block w-[4.5rem] text-center">
              {loading ? "Loading" : "Refresh"}
            </span>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="bg-red-500/15 px-3 py-2 text-base text-red-300">{error}</p>
      ) : null}

      {submissions.length === 0 ? (
        <p className="bg-zinc-900 px-3 py-3 text-base text-muted-foreground">
          No applications submitted yet. Share /apply with candidates to test their Project Room
          steering and 15 operator answers.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex max-h-[32rem] flex-col gap-1.5 overflow-y-auto bg-zinc-900 p-2">
            {submissions.map((sub) => {
              const active = selected?.id === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedId(sub.id)}
                  className={cn(
                    "flex flex-col gap-1 p-2.5 text-left",
                    active
                      ? "border-l-2 border-primary bg-black text-white"
                      : "bg-zinc-950 text-zinc-300 hover:bg-black/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{sub.candidate.name}</span>
                    <span className="tabular-nums text-emerald-300">
                      {sub.evaluation.overallScore}/100
                    </span>
                  </div>
                  <span className="truncate text-muted-foreground">{sub.candidate.email}</span>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{sub.evaluation.classification}</span>
                    <span className="tabular-nums">
                      Room {sub.projectRoom.validation.passedCount}/
                      {sub.projectRoom.validation.totalCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto bg-zinc-900 p-4 lg:col-span-2">
              <div className="flex flex-col gap-1 bg-black p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    {selected.candidate.name} ({selected.candidate.email})
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {selected.submittedAt}
                  </span>
                </div>
                <p className="text-zinc-300">
                  Rate: {selected.candidate.rate || "N/A"} · Availability:{" "}
                  {selected.candidate.availability || "N/A"} · Profile:{" "}
                  {selected.candidate.profileUrl || "N/A"}
                </p>
                {selected.candidate.fitNote ? (
                  <p className="mt-1 text-zinc-200">{selected.candidate.fitNote}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 bg-black p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">AI Evaluator Scorecard</span>
                  <span className="tabular-nums text-emerald-300">
                    Overall {selected.evaluation.overallScore}/100 · Authenticity{" "}
                    {selected.evaluation.humanAuthenticityScore}/100 · Room{" "}
                    {selected.evaluation.projectRoomScore}/100 · Questions{" "}
                    {selected.evaluation.writtenQuestionsScore}/100
                  </span>
                </div>
                <p className="text-zinc-200">{selected.evaluation.summary}</p>
              </div>

              <div className="flex flex-col gap-2 bg-black p-3">
                <span className="font-semibold text-white">
                  Project Room Steering Transcript ({selected.projectRoom.turnCount} messages)
                </span>
                <pre className="overflow-x-auto bg-zinc-950 p-2.5 font-mono text-base text-zinc-200">
                  {JSON.stringify(selected.projectRoom.artifact, null, 2)}
                </pre>
                {selected.projectRoom.chatHistory.map((turn, idx) => (
                  <div key={`${turn.timestamp}-${idx}`} className="bg-zinc-950 p-2 text-base">
                    <span className="font-semibold text-muted-foreground">
                      {turn.role === "user" ? "Candidate: " : "Assistant: "}
                    </span>
                    <span className="text-zinc-200">{turn.content}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 bg-black p-3">
                <span className="font-semibold text-white">15 Application Answers</span>
                {CAREER_APPLICATION_QUESTIONS.map((q) => (
                  <div key={q.id} className="flex flex-col gap-1 bg-zinc-950 p-2.5">
                    <span className="font-medium text-white">
                      {q.number}. {q.prompt}
                    </span>
                    <p className="text-zinc-200">{selected.answers[q.id] ?? ""}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
