import fs from "node:fs";

const secrets = fs.readFileSync(
  "wordpress-plugins/neo-pulse-app/includes/neo-pulse-app-secrets.php",
  "utf8",
);
const m = secrets.match(/NEO_PULSE_APP_OPENROUTER_API_KEY',\s*'([^']+)'/);
const key = m ? m[1] : "";

const pageText = ("Neo Digital builds websites in Edmonton. ".repeat(400));

async function tryOnce(label, body) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const msg = json?.choices?.[0]?.message || {};
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  console.log(
    label,
    "status",
    res.status,
    "finish",
    json?.choices?.[0]?.finish_reason,
    "contentLen",
    (content || "").length,
    "reasoningLen",
    String(msg.reasoning || "").length,
    "contentHead",
    String(content || "").slice(0, 120),
  );
  if (json?.error) console.log("error", json.error);
}

const baseMessages = [
  {
    role: "system",
    content:
      'You audit WordPress blog posts. Return JSON only: {"findings":[{"severity":"high|medium|low","certainty":"proven|confirm","quote":"...","problem":"...","fix":"..."}]}. Empty findings is valid when the page is clean.',
  },
  {
    role: "user",
    content: `PROPERTY JSON: {"name":"Neo Digital","cities":["Edmonton"]}\n\nPAGE JSON: {"id":1,"title":"Home","type":"post"}\n\nPAGE TEXT:\n${pageText}`,
  },
];

await tryOnce("deepseek-none", {
  model: "deepseek/deepseek-v4.1-flash",
  temperature: 0.1,
  max_tokens: 4096,
  response_format: { type: "json_object" },
  reasoning: { effort: "none", exclude: true },
  messages: baseMessages,
});
