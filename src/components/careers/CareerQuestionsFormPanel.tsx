import React from "react";
import { Input, Textarea } from "@/ui";
import { CAREER_APPLICATION_QUESTIONS } from "@/components/careers/career-role-data";
import type { CandidateProfileInput } from "@/lib/careers/careers-api";
import { cn } from "@/lib/utils";

const FLAT_INPUT_CLASS =
  "h-9 w-full rounded-none border-0 bg-zinc-900 px-3 text-base text-white placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/55";

const FLAT_TEXTAREA_CLASS =
  "min-h-[5.5rem] w-full rounded-none border-0 bg-zinc-900 p-3 text-base text-white placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/55";

export interface CareerQuestionsFormPanelProps {
  candidate: CandidateProfileInput;
  onCandidateChange: (patch: Partial<CandidateProfileInput>) => void;
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
}

export function CareerQuestionsFormPanel({
  candidate,
  onCandidateChange,
  answers,
  onAnswerChange,
}: CareerQuestionsFormPanelProps): React.ReactElement {
  const answeredCount = CAREER_APPLICATION_QUESTIONS.filter(
    (q) => (answers[q.id] ?? "").trim().length > 0,
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-7 sm:px-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-white">Candidate Details</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Input
            aria-label="Full name"
            placeholder="Full name (required)"
            value={candidate.name}
            onChange={(e) => onCandidateChange({ name: e.target.value })}
            className={FLAT_INPUT_CLASS}
          />
          <Input
            aria-label="Email address"
            type="email"
            placeholder="Email address (required)"
            value={candidate.email}
            onChange={(e) => onCandidateChange({ email: e.target.value })}
            className={FLAT_INPUT_CLASS}
          />
          <Input
            aria-label="Resume or LinkedIn URL"
            placeholder="Resume or LinkedIn URL"
            value={candidate.profileUrl}
            onChange={(e) => onCandidateChange({ profileUrl: e.target.value })}
            className={FLAT_INPUT_CLASS}
          />
          <Input
            aria-label="Hourly rate or monthly retainer expectation"
            placeholder="Hourly rate or monthly retainer expectation (e.g. $55/hr CAD)"
            value={candidate.rate}
            onChange={(e) => onCandidateChange({ rate: e.target.value })}
            className={FLAT_INPUT_CLASS}
          />
          <Input
            aria-label="Weekly availability and timezone"
            placeholder="Weekly availability and timezone (e.g. 20 hrs/wk, MST)"
            value={candidate.availability}
            onChange={(e) => onCandidateChange({ availability: e.target.value })}
            className={FLAT_INPUT_CLASS}
          />
          <Input
            aria-label="Redacted sample URL"
            placeholder="Optional redacted sample URL (audit checklist, bulk QA sheet, or GitHub PR)"
            value={candidate.sampleUrl}
            onChange={(e) => onCandidateChange({ sampleUrl: e.target.value })}
            className={FLAT_INPUT_CLASS}
          />
        </div>
        <Textarea
          aria-label="Why agentic operator work fits you"
          placeholder="Short note: why agentic SEO operator + light harness development work fits you"
          value={candidate.fitNote}
          onChange={(e) => onCandidateChange({ fitNote: e.target.value })}
          className={FLAT_TEXTAREA_CLASS}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Operator & Harness Questions (15)
          </h2>
          <span className="text-base tabular-nums text-muted-foreground">
            {answeredCount}/15 answered
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {CAREER_APPLICATION_QUESTIONS.map((q) => {
            const val = answers[q.id] ?? "";
            const filled = val.trim().length > 0;
            return (
              <div key={q.id} className="flex flex-col gap-1.5 bg-zinc-950 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-medium text-white">
                    {q.number}. {q.prompt}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 text-base tabular-nums",
                      filled
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-zinc-900 text-muted-foreground",
                    )}
                  >
                    {filled ? "Ready" : "Required"}
                  </span>
                </div>
                <Textarea
                  aria-label={`Question ${q.number} answer`}
                  placeholder=""
                  value={val}
                  onChange={(e) => onAnswerChange(q.id, e.target.value)}
                  className={FLAT_TEXTAREA_CLASS}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
