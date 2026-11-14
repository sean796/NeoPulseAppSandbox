import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { getSessionToken } from "@/lib/auth-device";
import type {
  AuthUser,
  JobTitlePreset,
  MemberProfile,
  TeamInvite,
  TeamMember,
  TeamPermissions,
  TeamSummary,
  TeamAccessRole,
} from "@/lib/teams-types";
import type { ManagerCloudSnapshotV1 } from "@/lib/manager-cloud-settings-snapshot";

function api(path: string, options?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(options?.headers);
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(backendApiUrl(p), { ...options, headers, credentials: "include", cache: "no-store" });
}

function stripJsonBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function formatApiTransportError(raw: string, res: Response): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.includes("<!DOCTYPE")) {
    return `Backend returned HTML instead of JSON (${res.status}). Check local WordPress plugin sync.`;
  }
  if (trimmed.length > 240) {
    return `${trimmed.slice(0, 240).trim()}…`;
  }
  return trimmed || res.statusText || `Request failed (${res.status})`;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const raw = stripJsonBom(await res.text());
  return JSON.parse(raw) as T;
}

async function parseApiResult(res: Response): Promise<{ ok: boolean; error?: string; transport?: string }> {
  const raw = stripJsonBom(await res.text());
  let data: { ok?: boolean; error?: string; transport?: string } = {};
  try {
    data = JSON.parse(raw) as { ok?: boolean; error?: string; transport?: string };
  } catch {
    return { ok: false, error: formatApiTransportError(raw, res) };
  }
  if (data.ok) return { ok: true, transport: data.transport };
  return { ok: false, error: data.error || res.statusText || `Request failed (${res.status})` };
}

export type AuthMeResponse = {
  ok: boolean;
  username?: string | null;
  user?: AuthUser | null;
  teams?: { id: number; name: string; slug: string }[];
  activeTeam?: TeamSummary | null;
  permissions?: TeamPermissions | null;
};

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const res = await api(`/auth/me?_=${Date.now()}`);
  const raw = stripJsonBom(await res.text());
  try {
    return JSON.parse(raw) as AuthMeResponse;
  } catch {
    return { ok: false };
  }
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; sessionToken?: string }> {
  const res = await api("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, email, password }),
  });
  const raw = stripJsonBom(await res.text());
  let data: { ok?: boolean; error?: string; sessionToken?: string } = {};
  try {
    data = JSON.parse(raw) as { ok?: boolean; error?: string; sessionToken?: string };
  } catch {
    return {
      ok: false,
      error: formatApiTransportError(raw, res),
    };
  }
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || res.statusText || "Invalid credentials" };
  }
  return { ok: true, sessionToken: data.sessionToken };
}

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api("/auth/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return parseApiResult(res);
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api("/auth/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return parseApiResult(res);
}

export async function logoutApi(): Promise<void> {
  await api("/auth/logout", { method: "POST" });
}

export async function registerWithInvite(payload: {
  inviteToken: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await api("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}

export async function validateInviteToken(token: string): Promise<{
  ok: boolean;
  email?: string;
  team?: { id: number; name: string };
  jobTitle?: string;
  accessRole?: TeamAccessRole;
  error?: string;
}> {
  const res = await api(`/teams/invites/accept?token=${encodeURIComponent(token)}`);
  return (await res.json()) as {
    ok: boolean;
    email?: string;
    team?: { id: number; name: string };
    jobTitle?: string;
    accessRole?: TeamAccessRole;
    error?: string;
  };
}

export async function fetchTeams(): Promise<TeamSummary[]> {
  const res = await api("/teams");
  const data = (await res.json()) as { ok?: boolean; teams?: TeamSummary[] };
  return data.teams ?? [];
}

export async function createTeam(payload: {
  name: string;
  jobTitle?: string;
}): Promise<{ ok: boolean; team?: TeamSummary; error?: string }> {
  const res = await api("/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; team?: TeamSummary; error?: string };
  return { ok: Boolean(data.ok), team: data.team, error: data.error };
}

export async function updateTeam(
  teamId: number,
  payload: { name?: string },
): Promise<{ ok: boolean; team?: TeamSummary; error?: string }> {
  const res = await api(`/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; team?: TeamSummary; error?: string };
  return { ok: Boolean(data.ok), team: data.team, error: data.error };
}

export async function switchTeam(teamId: number): Promise<{ ok: boolean; team?: TeamSummary; error?: string }> {
  const res = await api(`/teams/${teamId}/switch`, { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; team?: TeamSummary; error?: string };
  return { ok: Boolean(data.ok), team: data.team, error: data.error };
}

export async function fetchTeamMembers(teamId: number): Promise<TeamMember[]> {
  const res = await api(`/teams/${teamId}/members`);
  const data = (await res.json()) as { ok?: boolean; members?: TeamMember[] };
  return data.members ?? [];
}

export async function fetchTeamMember(teamId: number, userId: number): Promise<TeamMember | null> {
  const res = await api(`/teams/${teamId}/members/${userId}`);
  const data = (await res.json()) as { ok?: boolean; member?: TeamMember };
  return data.member ?? null;
}

export async function updateTeamMember(
  teamId: number,
  userId: number,
  payload: {
    displayName?: string;
    jobTitle?: string;
    accessRole?: TeamAccessRole;
    profile?: MemberProfile;
    password?: string;
    remove?: boolean;
  },
): Promise<{ ok: boolean; member?: TeamMember; error?: string }> {
  const res = await api(`/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; member?: TeamMember; error?: string };
  return { ok: Boolean(data.ok), member: data.member, error: data.error };
}

export async function fetchJobTitlePresets(teamId: number): Promise<JobTitlePreset[]> {
  const res = await api(`/teams/${teamId}/job-titles`);
  const data = (await res.json()) as { ok?: boolean; presets?: JobTitlePreset[] };
  return data.presets ?? [];
}

export async function addJobTitlePreset(
  teamId: number,
  title: string,
): Promise<{ ok: boolean; preset?: JobTitlePreset; error?: string }> {
  const res = await api(`/teams/${teamId}/job-titles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.trim() }),
  });
  const data = (await res.json()) as { ok?: boolean; preset?: JobTitlePreset; error?: string };
  return { ok: Boolean(data.ok), preset: data.preset, error: data.error };
}

export async function fetchPendingInvites(teamId: number): Promise<TeamInvite[]> {
  const res = await api(`/teams/${teamId}/invites`);
  const data = (await res.json()) as { ok?: boolean; invites?: TeamInvite[] };
  return data.invites ?? [];
}

export async function addTeamMember(
  teamId: number,
  payload: {
    email: string;
    accessRole: TeamAccessRole;
    jobTitle: string;
    displayName?: string;
    password?: string;
  },
): Promise<{ ok: boolean; member?: TeamMember; error?: string }> {
  try {
    const res = await api(`/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; member?: TeamMember; error?: string };
    if (data.ok) return { ok: true, member: data.member };
    return { ok: false, error: data.error || res.statusText || `Request failed (${res.status})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function sendTeamInvite(
  teamId: number,
  payload: { email: string; accessRole: TeamAccessRole; jobTitle: string },
): Promise<{ ok: boolean; added?: boolean; error?: string }> {
  try {
    const res = await api(`/teams/${teamId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let data: { ok?: boolean; added?: boolean; error?: string } = {};
    try {
      data = JSON.parse(raw) as { ok?: boolean; added?: boolean; error?: string };
    } catch {
      return { ok: false, error: formatApiTransportError(raw, res) };
    }
    if (data.ok) return { ok: true, added: Boolean(data.added) };
    return { ok: false, error: data.error || res.statusText || `Request failed (${res.status})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function revokeTeamInvite(teamId: number, inviteId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api(`/teams/${teamId}/invites/${inviteId}/revoke`, { method: "POST" });
    return await parseApiResult(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function resendTeamInvite(teamId: number, inviteId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api(`/teams/${teamId}/invites/${inviteId}/resend`, { method: "POST" });
    return await parseApiResult(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function copyTeamInviteLink(
  teamId: number,
  inviteId: number,
): Promise<{ ok: boolean; email?: string; subject?: string; message?: string; acceptUrl?: string; error?: string }> {
  try {
    const res = await api(`/teams/${teamId}/invites/${inviteId}/copy-link`, { method: "POST" });
    const data = (await res.json()) as {
      ok?: boolean;
      email?: string;
      subject?: string;
      message?: string;
      acceptUrl?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Could not load invite link." };
    }
    return {
      ok: true,
      email: data.email,
      subject: data.subject,
      message: data.message,
      acceptUrl: data.acceptUrl,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function sendTeamMailTest(teamId: number, email: string): Promise<{ ok: boolean; error?: string; transport?: string }> {
  try {
    const res = await api(`/teams/${teamId}/mail-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    return await parseApiResult(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function sendTeamMail(
  teamId: number,
  input: {
    to: string;
    subject: string;
    message: string;
    attachments?: Array<{ fileName: string; mime: string; content: string }>;
  },
): Promise<{ ok: boolean; error?: string; transport?: string }> {
  try {
    const attachments = (input.attachments ?? [])
      .map((file) => ({
        fileName: file.fileName.trim(),
        mime: file.mime.trim() || "application/octet-stream",
        content: file.content,
      }))
      .filter((file) => file.fileName && file.content);
    const res = await api(`/teams/${teamId}/mail/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: input.to.trim(),
        subject: input.subject.trim(),
        message: input.message,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });
    return await parseApiResult(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function loadTeamWorkspace(teamId: number): Promise<{
  ok: boolean;
  snapshot: ManagerCloudSnapshotV1 | null;
  updatedAt?: string | null;
}> {
  const res = await api(`/teams/${teamId}/workspace`);
  const data = (await res.json()) as {
    ok?: boolean;
    snapshot?: ManagerCloudSnapshotV1 | null;
    updatedAt?: string | null;
  };
  return { ok: Boolean(data.ok), snapshot: data.snapshot ?? null, updatedAt: data.updatedAt };
}

export async function saveTeamWorkspace(
  teamId: number,
  snapshot: ManagerCloudSnapshotV1,
): Promise<{ ok: boolean; updatedAt?: string; error?: string }> {
  const res = await api(`/teams/${teamId}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
  const data = (await res.json()) as { ok?: boolean; updatedAt?: string; error?: string };
  return { ok: Boolean(data.ok), updatedAt: data.updatedAt, error: data.error };
}

export async function importBrowserSnapshotToTeam(
  teamId: number,
  snapshot: ManagerCloudSnapshotV1,
): Promise<{ ok: boolean; error?: string }> {
  const r = await saveTeamWorkspace(teamId, snapshot);
  return { ok: r.ok, error: r.error };
}
