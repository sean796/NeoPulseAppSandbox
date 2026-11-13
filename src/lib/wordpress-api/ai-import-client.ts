/**
 * Thin browser caller for POST /api/wordpress/ai-import-client.
 * Server runs Neo MCP + OpenRouter; browser never talks to WordPress.
 */

import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { BACKEND_CONNECTION_ERROR, backendApiUrl } from "./connection";

export type AiImportClientLocation = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string | null;
  zip: string;
  phone: string;
  isDefault: boolean;
};

export type AiImportClientSuccess = {
  success: true;
  name: string;
  siteUrl: string;
  primaryLocalKeyword: string | null;
  clientLogoUrl: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceCountry: string | null;
  locations: AiImportClientLocation[];
  sitemapUrl: string | null;
  capabilities?: unknown;
};

export type AiImportClientFailure = {
  success: false;
  error: string;
  code?: string;
};

export type AiImportClientResult = AiImportClientSuccess | AiImportClientFailure;

export async function aiImportClient(input: {
  siteUrl: string;
  username: string;
  appPassword: string;
}): Promise<AiImportClientResult> {
  const siteUrl = input.siteUrl.trim();
  const username = input.username.trim();
  const appPassword = input.appPassword.trim();
  if (!siteUrl || !username || !appPassword) {
    return {
      success: false,
      error: "Site URL, username, and application password are required",
      code: "missing_fields",
    };
  }

  const url = backendApiUrl("/wordpress/ai-import-client");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ siteUrl, username, appPassword }),
    });
  } catch {
    return { success: false, error: BACKEND_CONNECTION_ERROR, code: "backend_unreachable" };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      success: false,
      error: `Server returned ${response.status}`,
      code: "invalid_response",
    };
  }

  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid server response", code: "invalid_response" };
  }

  const body = data as Record<string, unknown>;
  if (body.success === true) {
    return body as AiImportClientSuccess;
  }

  const error =
    typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : `Import failed (${response.status})`;

  return {
    success: false,
    error,
    code: typeof body.code === "string" ? body.code : undefined,
  };
}
