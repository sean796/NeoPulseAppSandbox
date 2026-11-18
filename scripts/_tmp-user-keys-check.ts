import { setSessionToken } from "../src/lib/auth-device.ts";
import { backendApiUrl, setPostCreatorWorkerApiBase } from "../src/lib/wordpress-api/connection.ts";
import { hydrateRuntimeApiKeysFromCloud } from "../src/components/integrations/storage.ts";
import { loadDataForSEOApiKey, loadApiKey } from "../src/lib/api.ts";

setPostCreatorWorkerApiBase("http://127.0.0.1:8080");
process.env.VITE_BACKEND_API_BASE = "http://127.0.0.1:8080";
delete process.env.DATAFORSEO_API_KEY;
delete process.env.DATAFORSEO_LOGIN;
delete process.env.OPENROUTER_API_KEY;

const login = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../.cursor-tmp-login.json", import.meta.url), "utf8"),
  ),
) as { email: string; password: string };

const loginRes = await fetch(backendApiUrl("/auth/login"), {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    username: login.email,
    email: login.email,
    password: login.password,
  }),
});
const loginJson = (await loginRes.json()) as { ok?: boolean; sessionToken?: string };
if (!loginJson.sessionToken) {
  console.log("login failed", loginRes.status);
  process.exit(1);
}
setSessionToken(loginJson.sessionToken);
const meRes = await fetch(backendApiUrl("/auth/me"), {
  headers: { Authorization: `Bearer ${loginJson.sessionToken}`, Accept: "application/json" },
});
const me = (await meRes.json()) as {
  activeTeam?: { id?: number };
  teams?: Array<{ id?: number }>;
};
const teamId = me.activeTeam?.id ?? me.teams?.[0]?.id ?? null;
await hydrateRuntimeApiKeysFromCloud(teamId);
console.log(
  JSON.stringify({
    teamId,
    hasDataForSeo: Boolean(loadDataForSEOApiKey()?.trim()),
    hasOpenRouter: Boolean(loadApiKey()?.trim()),
  }),
);
