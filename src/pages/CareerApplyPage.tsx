import React, { useMemo, useState } from "react";
import { Briefcase, CheckCircle2, FileText, TerminalSquare } from "lucide-react";
import { Button } from "@/ui";
import { SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import {
  ADMIN_PASS_ANSWERS,
  CAREER_APPLICATION_QUESTIONS,
  CAREER_ROLE_HEADER,
  CAREER_ROLE_SECTIONS,
  INITIAL_FLAWED_ARTIFACT,
  INITIAL_FLAWED_HARNESS_PROMPT,
  type ProjectRoomArtifact,
} from "@/components/careers/career-role-data";
import { CareerQuestionsFormPanel } from "@/components/careers/CareerQuestionsFormPanel";
import { CareerProjectRoomPanel } from "@/components/careers/CareerProjectRoomPanel";
import {
  submitCareerApplication,
  validateProjectRoomArtifact,
  type CandidateProfileInput,
  type CareerEvaluationScorecard,
  type ProjectRoomChatTurn,
} from "@/lib/careers/careers-api";
import { cn } from "@/lib/utils";

type ApplyStepId = "brief" | "questions" | "project-room";

export default function CareerApplyPage(): React.ReactElement {
  const [activeStep, setActiveStep] = useState<ApplyStepId>("brief");
  const [candidate, setCandidate] = useState<CandidateProfileInput>({
    name: "",
    email: "",
    profileUrl: "",
    rate: "",
    availability: "",
    sampleUrl: "",
    fitNote: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [harnessPrompt, setHarnessPrompt] = useState<string>(INITIAL_FLAWED_HARNESS_PROMPT);
  const [artifactJson, setArtifactJson] = useState<string>(() =>
    JSON.stringify(INITIAL_FLAWED_ARTIFACT, null, 2),
  );
  const [chatHistory, setChatHistory] = useState<ProjectRoomChatTurn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    submissionId: string;
    scorecard: CareerEvaluationScorecard;
  } | null>(null);

  const parsedArtifactState = useMemo((): {
    artifact: ProjectRoomArtifact;
    error: string | null;
  } => {
    try {
      const parsed = JSON.parse(artifactJson) as ProjectRoomArtifact;
      return { artifact: parsed, error: null };
    } catch (e) {
      return {
        artifact: INITIAL_FLAWED_ARTIFACT,
        error: e instanceof Error ? e.message : "Invalid JSON",
      };
    }
  }, [artifactJson]);

  const validation = useMemo(
    () => validateProjectRoomArtifact(parsedArtifactState.artifact),
    [parsedArtifactState.artifact],
  );

  const answeredCount = useMemo(
    () =>
      CAREER_APPLICATION_QUESTIONS.filter((q) => (answers[q.id] ?? "").trim().length > 0).length,
    [answers],
  );

  function handleAdminPass() {
    setSubmitError(null);
    setCandidate({
      name: "Admin Test Operator",
      email: "sean@neodigital.ca",
      profileUrl: "https://neodigital.ca",
      rate: "Admin Pass",
      availability: "Full-time MST",
      sampleUrl: "",
      fitNote: "Admin pass bypass to test Live AI Project Room.",
    });
    setAnswers({ ...ADMIN_PASS_ANSWERS });
    setActiveStep("project-room");
  }

  async function handleFinalSubmit() {
    setSubmitError(null);
    if (!candidate.name.trim() || !candidate.email.trim()) {
      setSubmitError("Enter your name and email in Step 2 (15 Questions) before submitting.");
      setActiveStep("questions");
      return;
    }
    if (answeredCount < CAREER_APPLICATION_QUESTIONS.length) {
      setSubmitError(
        `Complete all 15 questions (${answeredCount}/15 answered) before submitting.`,
      );
      setActiveStep("questions");
      return;
    }
    if (parsedArtifactState.error) {
      setSubmitError("Fix the JSON syntax error in the Project Room before submitting.");
      setActiveStep("project-room");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitCareerApplication({
        candidate,
        answers,
        projectRoom: {
          harnessPrompt,
          artifact: parsedArtifactState.artifact,
          chatHistory,
        },
      });
      setSubmittedResult({
        submissionId: res.submissionId,
        scorecard: res.evaluation,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const statusText = submittedResult
    ? `Submitted (${submittedResult.submissionId})`
    : `Q: ${answeredCount}/15 · Room: ${validation.passedCount}/${validation.totalCount} checks`;

  return (
    <div
      className={cn(
        SEO_WORKSPACE_TYPO_CLASS,
        "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black text-white",
      )}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-black">
        <aside
          aria-label="Application steps"
          className="flex h-full min-h-0 w-[21rem] shrink-0 flex-col border-r border-white/10 bg-black font-sans text-base text-white"
        >
          <div className="flex h-11 shrink-0 items-center border-b border-white/10 bg-black px-3 font-semibold text-white">
            Neo Digital Careers
          </div>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setActiveStep("brief")}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-3 text-left",
                activeStep === "brief"
                  ? "border-l-2 border-primary bg-zinc-900"
                  : "bg-black hover:bg-zinc-900/50",
              )}
            >
              <span className="flex items-center gap-2 text-base font-medium text-white">
                <Briefcase className="h-4 w-4 shrink-0" aria-hidden />
                1. Role Brief & Terms
              </span>
              <span className="text-base text-muted-foreground">
                NEO Pulse Operator / Developer
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveStep("questions")}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-3 text-left",
                activeStep === "questions"
                  ? "border-l-2 border-primary bg-zinc-900"
                  : "bg-black hover:bg-zinc-900/50",
              )}
            >
              <span className="flex items-center gap-2 text-base font-medium text-white">
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                2. Candidate & 15 Questions
              </span>
              <span className="text-base tabular-nums text-muted-foreground">
                {answeredCount}/15 completed
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveStep("project-room")}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-3 text-left",
                activeStep === "project-room"
                  ? "border-l-2 border-primary bg-zinc-900"
                  : "bg-black hover:bg-zinc-900/50",
              )}
            >
              <span className="flex items-center gap-2 text-base font-medium text-white">
                <TerminalSquare className="h-4 w-4 shrink-0" aria-hidden />
                3. Live AI Project Room
              </span>
              <span className="text-base tabular-nums text-muted-foreground">
                {validation.passedCount}/{validation.totalCount} contract checks
              </span>
            </button>
          </div>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
          <header
            className="flex h-11 w-full min-w-0 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black px-3"
            aria-label="Application toolbar"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="inline-flex h-8 shrink-0 items-center gap-2 bg-zinc-900 px-3 font-semibold text-white">
                <Briefcase className="h-4 w-4 shrink-0" aria-hidden />
                <span>NEO Pulse Operator Application</span>
              </div>
              <div className="inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 items-center bg-zinc-900 px-3 font-mono text-base tabular-nums text-zinc-200">
                <span className="truncate">{statusText}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="quiet"
                type="button"
                onClick={handleAdminPass}
              >
                <span className="inline-block w-[6.5rem] text-center">Admin Pass</span>
              </Button>
              <Button
                variant="run"
                type="button"
                disabled={submitting || Boolean(submittedResult)}
                onClick={() => void handleFinalSubmit()}
              >
                <span className="inline-block w-[9.5rem] text-center">
                  {submitting
                    ? "Evaluating..."
                    : submittedResult
                      ? "Submitted"
                      : "Submit Application"}
                </span>
              </Button>
            </div>
          </header>

          {submitError ? (
            <div className="shrink-0 bg-red-500/15 px-4 py-2 text-base text-red-300">
              {submitError}
            </div>
          ) : null}

          {submittedResult ? (
            <div className="shrink-0 bg-emerald-500/15 px-4 py-3 text-base text-emerald-200">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
                <span>
                  Application {submittedResult.submissionId} received. Overall AI Scorecard:{" "}
                  {submittedResult.scorecard.overallScore}/100 (Project Room:{" "}
                  {submittedResult.scorecard.projectRoomScore}/100).
                </span>
              </div>
              <p className="mt-1 text-base text-zinc-200">{submittedResult.scorecard.summary}</p>
            </div>
          ) : null}

          <main className="min-h-0 flex-1 overflow-y-auto">
            {activeStep === "brief" ? (
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-7 sm:px-10">
                <div className="flex flex-col gap-2 bg-zinc-950 p-5">
                  <h1 className="text-base font-semibold text-white">
                    {CAREER_ROLE_HEADER.title}
                  </h1>
                  <p className="text-base text-muted-foreground">
                    {CAREER_ROLE_HEADER.company} · {CAREER_ROLE_HEADER.location} ·{" "}
                    {CAREER_ROLE_HEADER.engagement}
                  </p>
                </div>

                {CAREER_ROLE_SECTIONS.map((sec) => (
                  <section key={sec.heading} className="flex flex-col gap-2 bg-zinc-950 p-5">
                    <h2 className="text-base font-semibold text-white">{sec.heading}</h2>
                    {sec.paragraphs?.map((p) => (
                      <p key={p} className="text-base text-zinc-200">
                        {p}
                      </p>
                    ))}
                    {sec.bullets ? (
                      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-zinc-200">
                        {sec.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}

            {activeStep === "questions" ? (
              <CareerQuestionsFormPanel
                candidate={candidate}
                onCandidateChange={(patch) => setCandidate((prev) => ({ ...prev, ...patch }))}
                answers={answers}
                onAnswerChange={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val }))}
              />
            ) : null}

            {activeStep === "project-room" ? (
              <CareerProjectRoomPanel
                harnessPrompt={harnessPrompt}
                onHarnessPromptChange={setHarnessPrompt}
                artifactJson={artifactJson}
                onArtifactJsonChange={setArtifactJson}
                jsonParseError={parsedArtifactState.error}
                validation={validation}
                chatHistory={chatHistory}
                onChatHistoryChange={setChatHistory}
                onApplyProposedArtifact={(proposed) =>
                  setArtifactJson(JSON.stringify(proposed, null, 2))
                }
              />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
