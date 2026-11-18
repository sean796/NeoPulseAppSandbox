import { existsSync, readFileSync } from "fs";
import { join } from "path";

const dataRoot = "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data";
const key = String(JSON.parse(readFileSync(join(dataRoot, "email-worker-keys.json"), "utf8")).openRouterApiKey || "").trim();
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
    "X-Title": "NEO Pulse model probe",
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-v4.1-flash",
    temperature: 0.1,
    max_tokens: 200,
    reasoning: { effort: "none" },
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Return {\"ok\":true}." },
    ],
  }),
});
const body = await res.text();
const parsed = JSON.parse(body);
const message = parsed?.choices?.[0]?.message || {};
console.log(
  JSON.stringify(
    {
      status: res.status,
      finish: parsed?.choices?.[0]?.finish_reason,
      keys: Object.keys(message),
      contentLen: String(message.content || "").length,
      content: String(message.content || "").slice(0, 180),
      error: parsed?.error?.message || "",
    },
    null,
    2,
  ),
);
