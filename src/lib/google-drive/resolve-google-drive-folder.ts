import {
  parseGoogleDriveFolderId,
  resolveGoogleDriveFolderPreset,
  formatGoogleDriveFolderUrl,
} from "@/lib/google-drive/google-drive-folder-presets";
import {
  NEO_PULSE_TEAM_WORKSPACE_FOLDER_NAME,
  buildDeliverySubfolderSegments,
  driveFolderBelongsToClient,
  inferGoogleDriveDeliveryPath,
  normalizeClientFolderName,
  pickExactDriveClientFolder,
  resolvePathSegments,
  type GoogleDriveTeamSettings,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import {
  listDriveFolderChildren,
  loadGoogleDriveTeamSettings,
  resolveDriveFolderPath,
} from "@/lib/google-drive/drive-folder-api";
import type { TaskExecutionClientRunContract, TaskExecutionPayload, GoogleDriveFolderSource } from "@/lib/tasks-types";
import { outputMatchesRagVariableKey } from "@/lib/rag-variable-key-match";
import type { AgentRunStepOutputSnapshot } from "@/lib/agent-runs/step-output-types";

export type { GoogleDriveFolderSource };

export type ResolveGoogleDriveFolderContext = {
  outputs?: AgentRunStepOutputSnapshot[];
  siteId?: string;
  clientSiteIds?: string[];
  teamSettings?: GoogleDriveTeamSettings;
  openRouterApiKey?: string;
  openRouterModel?: string;
  signal?: AbortSignal;
};

export type ResolvedGoogleDriveFolder = {
  folderId: string;
  label: string;
  webViewLink?: string;
  created?: string[];
};

export function buildAutoDriveFolderSegments(args: {
  siteName: string;
  siteUrl?: string;
  pathSegments?: string[];
  teamSettings: GoogleDriveTeamSettings;
  date?: Date;
  year?: string;
  month?: string;
}): string[] {
  const clientName = normalizeClientFolderName(args.siteName, args.siteUrl);
  if (!clientName) return [];
  const purposeSegments = args.pathSegments ?? [];
  const deliverySegments =
    purposeSegments.length > 0
      ? buildDeliverySubfolderSegments(purposeSegments, args.date, {
          year: args.year,
          month: args.month,
        })
      : [];
  return [clientName, ...deliverySegments];
}

async function resolveAutoFolderUnderTeamRoot(args: {
  siteName: string;
  siteUrl?: string;
  googleDriveFolderPath?: string;
  googleDriveFolderYear?: string;
  googleDriveFolderMonth?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder> {
  const clientName = normalizeClientFolderName(args.siteName, args.siteUrl);
  if (!clientName) {
    throw new Error("Client name is required to resolve the Google Drive folder.");
  }

  const teamSettings =
    args.context?.teamSettings ?? (await loadGoogleDriveTeamSettings()).settings;
  const workspace = await resolveDriveFolderPath({
    rootFolderId: teamSettings.teamRootFolderId,
    segments: [NEO_PULSE_TEAM_WORKSPACE_FOLDER_NAME],
    createMissing: true,
  });
  const children = await listDriveFolderChildren(workspace.folderId);
  const exact = pickExactDriveClientFolder(children, clientName);
  const created: string[] = [];

  let clientFolderId: string;
  let clientFolderName: string;
  if (exact) {
    clientFolderId = exact.folderId;
    clientFolderName = exact.name;
  } else {
    const createdClient = await resolveDriveFolderPath({
      rootFolderId: workspace.folderId,
      segments: [clientName],
      createMissing: true,
    });
    clientFolderId = createdClient.folderId;
    clientFolderName = clientName;
    created.push(...(createdClient.created ?? [clientName]));
  }

  const pathInput = String(args.googleDriveFolderPath ?? "").trim() || "reporting";
  const tailSegments = buildDeliverySubfolderSegments(resolvePathSegments(pathInput), new Date(), {
    year: args.googleDriveFolderYear,
    month: args.googleDriveFolderMonth,
  });
  const leaf = await resolveDriveFolderPath({
    rootFolderId: clientFolderId,
    segments: tailSegments,
    createMissing: true,
  });
  created.push(...(leaf.created ?? []));

  const label = [NEO_PULSE_TEAM_WORKSPACE_FOLDER_NAME, clientFolderName, ...tailSegments]
    .filter(Boolean)
    .join(" / ");
  if (!driveFolderBelongsToClient(label, clientName)) {
    throw new Error(`Google Drive folder is not this client (${clientName}).`);
  }

  return {
    folderId: leaf.folderId,
    label,
    webViewLink: leaf.webViewLink ?? formatGoogleDriveFolderUrl(leaf.folderId),
    created,
  };
}

function normalizeGoogleDriveFolderSource(
  source: GoogleDriveFolderSource | string | undefined,
): GoogleDriveFolderSource {
  const normalized = String(source ?? "manual").trim();
  if (normalized === "client_root" || normalized === "path" || normalized === "variable") {
    return normalized;
  }
  return "manual";
}

export function extractFolderIdFromStepOutput(output: AgentRunStepOutputSnapshot): string | null {
  const preview = String(output.textPreview ?? "").trim();
  const fromPreview = parseGoogleDriveFolderId(preview);
  if (fromPreview) return fromPreview;

  for (const file of output.fileRefs ?? []) {
    const fromUrl = parseGoogleDriveFolderId(String(file.url ?? ""));
    if (fromUrl) return fromUrl;
  }

  const deliveryFolderId = String(
    output.deliveryMeta?.googleDriveTargetFolderId ??
      output.deliveryMeta?.googleDriveFolderUrl ??
      "",
  ).trim();
  const fromTargetId = parseGoogleDriveFolderId(deliveryFolderId);
  if (fromTargetId) return fromTargetId;

  const deliveryUrl = String(output.deliveryMeta?.googleDriveUrl ?? "").trim();
  const fromDeliveryUrl = parseGoogleDriveFolderId(deliveryUrl);
  if (fromDeliveryUrl) return fromDeliveryUrl;

  return null;
}

function resolveManualFolder(
  contract: TaskExecutionClientRunContract,
): ResolvedGoogleDriveFolder | null {
  const preset = resolveGoogleDriveFolderPreset(
    contract.googleDrivePresetKey,
    contract.googleDriveFolderId,
  );
  const folderId = String(preset?.folderId ?? contract.googleDriveFolderId ?? "").trim();
  if (!folderId) return null;
  return {
    folderId,
    label: String(preset?.label ?? contract.googleDriveFolderLabel ?? "").trim() || "Custom folder",
    webViewLink: formatGoogleDriveFolderUrl(folderId),
  };
}

async function resolveManualDeliveryFolder(args: {
  contract: TaskExecutionClientRunContract;
  siteName: string;
  siteUrl?: string;
  executionKind?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder | null> {
  const manual = resolveManualFolder(args.contract);
  if (!manual) {
    return resolvePathFolder({
      contract: args.contract,
      siteName: args.siteName,
      siteUrl: args.siteUrl,
      executionKind: args.executionKind,
      context: args.context,
    });
  }
  const pathInput = String(args.contract.googleDriveFolderPath ?? "").trim() || "reporting";
  return resolveAutoFolderUnderTeamRoot({
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    googleDriveFolderPath: pathInput,
    googleDriveFolderYear: args.contract.googleDriveFolderYear,
    googleDriveFolderMonth: args.contract.googleDriveFolderMonth,
    context: args.context,
  });
}

function resolveVariableFolder(
  contract: TaskExecutionClientRunContract,
  context?: ResolveGoogleDriveFolderContext,
): ResolvedGoogleDriveFolder {
  const variableKey = String(contract.googleDriveFolderVariable ?? "").trim();
  if (!variableKey) {
    throw new Error("Select an upstream variable for the Google Drive folder.");
  }

  const outputs = context?.outputs ?? [];
  const siteId = context?.siteId?.trim() ?? "";
  const clientSiteIds = context?.clientSiteIds ?? [];
  const matches = outputs.filter(
    (output) =>
      output.scope === "run" &&
      outputMatchesRagVariableKey(output, variableKey, siteId, clientSiteIds),
  );

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const folderId = extractFolderIdFromStepOutput(matches[index]!);
    if (folderId) {
      return {
        folderId,
        label: matches[index]?.label?.trim() || variableKey,
        webViewLink: formatGoogleDriveFolderUrl(folderId),
      };
    }
  }

  throw new Error(`No Google Drive folder found in upstream variable {{${variableKey}}}.`);
}

async function resolvePathFolder(args: {
  contract: TaskExecutionClientRunContract;
  siteName: string;
  siteUrl?: string;
  executionKind?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder> {
  const pathInput =
    String(args.contract.googleDriveFolderPath ?? "").trim() ||
    inferGoogleDriveDeliveryPath(args.executionKind);
  return resolveAutoFolderUnderTeamRoot({
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    googleDriveFolderPath: pathInput,
    googleDriveFolderYear: args.contract.googleDriveFolderYear,
    googleDriveFolderMonth: args.contract.googleDriveFolderMonth,
    context: args.context,
  });
}

export async function resolveGoogleDriveFolder(args: {
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  siteName?: string;
  siteUrl?: string;
  executionKind?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder | null> {
  const contract = args.contract as TaskExecutionClientRunContract;
  if (contract.saveToGoogleDrive !== true) return null;

  const source = normalizeGoogleDriveFolderSource(contract.googleDriveFolderSource);
  if (source === "manual") {
    return resolveManualDeliveryFolder({
      contract,
      siteName: String(args.siteName ?? "").trim(),
      siteUrl: args.siteUrl,
      executionKind: args.executionKind,
      context: args.context,
    });
  }

  if (source === "variable") {
    return resolveVariableFolder(contract, args.context);
  }

  const siteName = String(args.siteName ?? "").trim();
  const siteUrl = args.siteUrl;

  if (source === "client_root") {
    return resolveAutoFolderUnderTeamRoot({
      siteName,
      siteUrl,
      googleDriveFolderPath: inferGoogleDriveDeliveryPath(args.executionKind),
      googleDriveFolderYear: contract.googleDriveFolderYear,
      googleDriveFolderMonth: contract.googleDriveFolderMonth,
      context: args.context,
    });
  }

  return resolvePathFolder({
    contract,
    siteName,
    siteUrl,
    executionKind: args.executionKind,
    context: args.context,
  });
}

export function googleDriveFolderIsConfigured(
  payload?: TaskExecutionPayload | null,
  siteName?: string,
): boolean {
  if (payload?.saveToGoogleDrive !== true) return false;
  const source = normalizeGoogleDriveFolderSource(payload.googleDriveFolderSource);
  if (source === "client_root") return Boolean(siteName?.trim());
  if (source === "path") return Boolean(String(payload.googleDriveFolderPath ?? "").trim() || siteName?.trim());
  if (source === "variable") return Boolean(payload.googleDriveFolderVariable?.trim());
  return Boolean(
    parseGoogleDriveFolderId(String(payload.googleDriveFolderId ?? "")) ||
      resolveGoogleDriveFolderPreset(payload.googleDrivePresetKey, payload.googleDriveFolderId),
  );
}

export async function resolveGoogleDriveFolderWithFallback(args: {
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  siteName?: string;
  siteUrl?: string;
  executionKind?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder | null> {
  const contract = args.contract as TaskExecutionClientRunContract;
  const source = normalizeGoogleDriveFolderSource(contract.googleDriveFolderSource);
  if (source === "manual") {
    return resolveManualDeliveryFolder({
      contract,
      siteName: String(args.siteName ?? "").trim(),
      siteUrl: args.siteUrl,
      executionKind: args.executionKind,
      context: args.context,
    });
  }

  return resolveGoogleDriveFolder(args);
}
