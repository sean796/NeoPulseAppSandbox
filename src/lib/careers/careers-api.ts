import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { ProjectRoomArtifact } from "@/components/careers/career-role-data";

export interface ProjectRoomChatTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ProjectRoomContractCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface ProjectRoomValidationResult {
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  checks: ProjectRoomContractCheck[];
}

export interface CandidateProfileInput {
  name: string;
  email: string;
  profileUrl: string;
  rate: string;
  availability: string;
  sampleUrl: string;
  fitNote: string;
}

export interface CareerEvaluationScorecard {
  overallScore: number;
  humanAuthenticityScore: number;
  projectRoomScore: number;
  writtenQuestionsScore: number;
  classification: "strong_human_operator" | "needs_review" | "suspected_unsteered_bot";
  caughtSeededFlaws: boolean;
  summary: string;
  strengths: string[];
  risks: string[];
}

export interface CareerSubmissionRecord {
  id: string;
  submittedAt: string;
  candidate: CandidateProfileInput;
  answers: Record<string, string>;
  projectRoom: {
    harnessPrompt: string;
    artifact: ProjectRoomArtifact;
    chatHistory: ProjectRoomChatTurn[];
    turnCount: number;
    validation: ProjectRoomValidationResult;
  };
  evaluation: CareerEvaluationScorecard;
}

/**
 * Deterministic contract verification matching the server-side rules in
 * Neo_Pulse_App_Careers_Route_Handlers::verify_project_room_artifact.
 */
export function validateProjectRoomArtifact(
  artifact: ProjectRoomArtifact,
): ProjectRoomValidationResult {
  const brand = (artifact.publicBrandName ?? "").trim();
  const seoTitle = (artifact.seoTitle ?? "").trim();
  const metaDesc = (artifact.metaDescription ?? "").trim();
  const focusKw = (artifact.focusKeyword ?? "").trim();
  const apiRoute = (artifact.executionRoute ?? "").trim();
  const pauseStep = (artifact.stagingVerificationStep ?? "").trim();
  const environment = (artifact.targetEnvironment ?? "").trim();

  const lowerBrand = brand.toLowerCase();
  const lowerTitle = seoTitle.toLowerCase();
  const lowerDesc = metaDesc.toLowerCase();
  const lowerKw = focusKw.toLowerCase();
  const lowerRoute = apiRoute.toLowerCase();

  const hasBlindSpot =
    lowerBrand.includes("blind spot") ||
    lowerTitle.includes("blind spot") ||
    lowerDesc.includes("blind spot");
  const brandOk = brand === "Shutter Spot" && !hasBlindSpot;

  const hasBrowserFetch =
    lowerRoute.includes("wp-json") ||
    lowerRoute.includes("http://") ||
    lowerRoute.includes("https://") ||
    lowerRoute.includes("fetch(");
  const routeOk = apiRoute === "/api/wordpress/update-post-meta" && !hasBrowserFetch;

  const titleLen = seoTitle.length;
  const hasColon = seoTitle.includes(":");
  const hasKwInTitle = lowerKw.length > 0 && lowerTitle.includes(lowerKw);
  const titleOk = titleLen >= 45 && titleLen <= 60 && !hasColon && hasKwInTitle;

  const descLen = metaDesc.length;
  const hasKwInDesc = lowerKw.length > 0 && lowerDesc.includes(lowerKw);
  const descOk = descLen >= 130 && descLen <= 160 && hasKwInDesc;

  const pauseOk = environment === "staging" && pauseStep.length >= 20;

  const checks: ProjectRoomContractCheck[] = [
    {
      id: "canonical_brand",
      passed: brandOk,
      detail: brandOk
        ? "Uses canonical Integrations brand Shutter Spot and rejects Google Ads MCC label Blind Spot."
        : 'Failed brand check: publicBrandName must be "Shutter Spot" and no field may contain "Blind Spot".',
    },
    {
      id: "server_side_route",
      passed: routeOk,
      detail: routeOk
        ? "Routes WordPress meta update through server-side /api/wordpress/update-post-meta."
        : 'Failed server-side route check: executionRoute must be "/api/wordpress/update-post-meta" (no direct wp-json or browser fetch).',
    },
    {
      id: "seo_title_contract",
      passed: titleOk,
      detail: titleOk
        ? `SEO title length (${titleLen} chars) is within 45-60 chars, includes focus keyword, and contains no colons.`
        : `Failed SEO title check (len ${titleLen}): must be 45-60 chars, include focusKeyword, and contain zero colons.`,
    },
    {
      id: "meta_description_contract",
      passed: descOk,
      detail: descOk
        ? `Meta description length (${descLen} chars) is within 130-160 chars and includes focus keyword.`
        : `Failed meta description check (len ${descLen}): must be 130-160 chars and include focusKeyword.`,
    },
    {
      id: "staging_hitl_gate",
      passed: pauseOk,
      detail: pauseOk
        ? "Targets staging first and defines an explicit human-in-the-loop verification pause."
        : 'Failed governance check: targetEnvironment must be "staging" and stagingVerificationStep (min 20 chars) must describe operator approval + read-back.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    allPassed: passedCount === checks.length,
    passedCount,
    totalCount: checks.length,
    checks,
  };
}

export async function sendProjectRoomChat(params: {
  message: string;
  harnessPrompt: string;
  currentArtifactJson: string;
  history: ProjectRoomChatTurn[];
}): Promise<{ reply: string; proposedArtifact: ProjectRoomArtifact }> {
  const res = await fetch(backendApiUrl("/careers/project-room/chat"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as {
    ok: boolean;
    reply?: string;
    proposedArtifact?: ProjectRoomArtifact;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.reply || !data.proposedArtifact) {
    throw new Error(data.error ?? `Project Room assistant error (${res.status})`);
  }
  return {
    reply: data.reply,
    proposedArtifact: data.proposedArtifact,
  };
}

export async function submitCareerApplication(params: {
  candidate: CandidateProfileInput;
  answers: Record<string, string>;
  projectRoom: {
    harnessPrompt: string;
    artifact: ProjectRoomArtifact;
    chatHistory: ProjectRoomChatTurn[];
  };
}): Promise<{
  submissionId: string;
  submittedAt: string;
  validation: ProjectRoomValidationResult;
  evaluation: CareerEvaluationScorecard;
}> {
  const res = await fetch(backendApiUrl("/careers/submit"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as {
    ok: boolean;
    submissionId?: string;
    submittedAt?: string;
    validation?: ProjectRoomValidationResult;
    evaluation?: CareerEvaluationScorecard;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.submissionId || !data.validation || !data.evaluation) {
    throw new Error(data.error ?? `Submission failed (${res.status})`);
  }
  return {
    submissionId: data.submissionId,
    submittedAt: data.submittedAt ?? "",
    validation: data.validation,
    evaluation: data.evaluation,
  };
}

export async function fetchCareerSubmissions(): Promise<CareerSubmissionRecord[]> {
  const res = await fetch(backendApiUrl("/careers/submissions"), {
    method: "GET",
    credentials: "include",
    headers: neoPulseApiHeaders(),
  });
  const data = (await res.json()) as {
    ok: boolean;
    submissions?: CareerSubmissionRecord[];
    error?: string;
  };
  if (!res.ok || !data.ok || !Array.isArray(data.submissions)) {
    throw new Error(data.error ?? `Failed to load submissions (${res.status})`);
  }
  return data.submissions;
}
