import { z } from "zod";
import type { WordPressSite } from "@/components/integrations/types";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import {
  resolvePageLocalContext,
} from "@/lib/content-optimization/page-local-context";
import { topicResearchFanoutMaxTokens } from "@/lib/content-optimization/topic-research-fanout-shared";
import type {
  IllustrativeExample,
  QueryFanout,
  ResearchFactCheckItem,
  ResearchFactCheckKind,
  ResearchFactCheckNapCard,
  ResearchFactCheckPacket,
  SeoContentBriefV1,
} from "@/lib/overview-seo-content-brief";

export const FACT_CHECKING_STEP_LABEL = "Fact checking";

const PLACE_TYPES = [
  "neighborhood",
  "city",
  "school",
  "subdivision",
  "park",
  "landmark",
] as const;

const FactCheckItemModelSchema = z.object({
  kind: z.enum(["nap", "place", "person", "source", "product"]),
  original: z.string(),
  verdict: z.enum(["pass", "rewrite"]),
  rewritten: z.string(),
  reason: z.string(),
  placeType: z.string().nullish(),
  placeCity: z.string().nullish(),
});

const FactCheckModelSchema = z.object({
  checks: z.array(FactCheckItemModelSchema),
  firstPartyClaims: z
    .array(z.object({ text: z.string(), source: z.string() }))
    .nullish(),
  illustrativeExample: z
    .object({
      personaName: z.string().nullish(),
      householdProfile: z.string().nullish(),
      situationHook: z.string().nullish(),
      scenarioNarrative: z.string().nullish(),
      recommendationParagraph: z.string().nullish(),
    })
    .nullish(),
  chatGptTexts: z.array(z.string()).nullish(),
});

const FACT_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checks", "firstPartyClaims", "illustrativeExample", "chatGptTexts"],
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "original", "verdict", "rewritten", "reason"],
        properties: {
          kind: {
            type: "string",
            enum: ["nap", "place", "person", "source", "product"],
          },
          original: { type: "string" },
          verdict: { type: "string", enum: ["pass", "rewrite"] },
          rewritten: { type: "string" },
          reason: { type: "string" },
          placeType: { type: "string" },
          placeCity: { type: "string" },
        },
      },
    },
    firstPartyClaims: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "source"],
        properties: {
          text: { type: "string" },
          source: { type: "string" },
        },
      },
    },
    illustrativeExample: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        personaName: { type: "string" },
        householdProfile: { type: "string" },
        situationHook: { type: "string" },
        scenarioNarrative: { type: "string" },
        recommendationParagraph: { type: "string" },
      },
    },
    chatGptTexts: { type: ["array", "null"], items: { type: "string" } },
  },
} as const;

const FACT_CHECK_SYSTEM = `You fact-check research text for a connected local business article before any content is written.

Return JSON only: {
  "checks": [ { "kind", "original", "verdict", "rewritten", "reason", "placeType?", "placeCity?" } ],
  "firstPartyClaims": [ { "text", "source" } ] | null,
  "illustrativeExample": { personaName?, householdProfile?, situationHook?, scenarioNarrative?, recommendationParagraph? } | null,
  "chatGptTexts": string[] | null
}.

Priority order (highest first):
1. NAP — business name, every street address, every phone, every email. A contact detail PASSES only when it matches the CANONICAL NAP CARD. Otherwise verdict is rewrite. rewritten must use a card value or drop the contact detail. Never invent a phone, address, email, or business name. When the NAP card is empty, rewritten must not publish any phone or street address.
2. Place — every neighborhood, city, school, subdivision, park, or landmark. It must exist in the primary service market (or the page's place entity). State which city it is in. placeType must be one of: neighborhood, city, school, subdivision, park, landmark. Wrong market or wrong type → rewrite (remove, or keep only with correct type and city when the source text supports that).
3. Person — a named person presented as a real customer or homeowner → rewrite to clear hypothetical framing or remove the name.
4. Source — a citation or URL the research does not support → rewrite to drop it or use only what the sources support.
5. Product — a product, price, or feature claim that contradicts the research → rewrite to the supported wording or remove it.

Rules:
- List every checkable claim you find in the research blocks. Empty checks only when there is nothing checkable.
- verdict pass: rewritten equals original (or "").
- verdict rewrite: rewritten is required and must be the corrected sentence or "" if the claim must be dropped.
- firstPartyClaims: when any claim text changes, return the full rewritten array (same length and sources as input). Otherwise null.
- illustrativeExample: when any persona field changes, return only the changed fields. Otherwise null.
- chatGptTexts: when any ChatGPT block changes, return the full parallel array. Otherwise null.
- Do not invent new places, phones, addresses, or real customers.`;

/** Numeric-only phone digits for NAP equality checks. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Build the canonical NAP card from Integrations property fields. */
export function buildNapCardFromSite(site?: WordPressSite | null): ResearchFactCheckNapCard {
  if (!site) {
    return { names: [], addresses: [], phones: [], emails: [] };
  }
  const nap = site.napInfo;
  const locs = [...(site.locations ?? []), ...(nap?.locations ?? [])];
  const names = uniqueNonEmpty([site.name, nap?.name, ...locs.map((l) => l.name)]);
  const addresses = uniqueNonEmpty([
    nap?.address,
    ...locs.map((l) => {
      const street = l.address?.trim() ?? "";
      const city = l.city?.trim() ?? "";
      const state = l.state?.trim() ?? "";
      const zip = l.zip?.trim() ?? "";
      const cityState = [city, state].filter(Boolean).join(", ");
      const tail = [cityState, zip].filter(Boolean).join(" ").trim();
      if (street && tail) return `${street}, ${tail}`;
      if (street) return street;
      if (tail) return tail;
      return "";
    }),
  ]);
  const phones = uniqueNonEmpty([nap?.phone, ...locs.map((l) => l.phone)]);
  const emails = uniqueNonEmpty([nap?.email, ...locs.map((l) => l.email)]);
  return { names, addresses, phones, emails };
}

export function formatNapCardPromptBlock(card: ResearchFactCheckNapCard): string {
  const lines = [
    "--- CANONICAL NAP CARD (SOURCE OF TRUTH — NON-NEGOTIABLE) ---",
    card.names.length ? `Names: ${card.names.join(" | ")}` : "Names: (none on file)",
    card.addresses.length
      ? `Addresses: ${card.addresses.join(" | ")}`
      : "Addresses: (none on file — do not publish a street address)",
    card.phones.length
      ? `Phones: ${card.phones.join(" | ")}`
      : "Phones: (none on file — do not publish a phone number)",
    card.emails.length
      ? `Emails: ${card.emails.join(" | ")}`
      : "Emails: (none on file — do not publish an email)",
    "--- END CANONICAL NAP CARD ---",
  ];
  return lines.join("\n");
}

export function formatFactCheckPromptBlock(
  packet: ResearchFactCheckPacket | undefined,
): string {
  if (!packet) return "";
  const lines = [
    "--- FACT CHECK (NAP + PLACE — NON-NEGOTIABLE) ---",
    `Checked at: ${packet.checkedAt}`,
    packet.primaryCity
      ? `Primary service city: ${packet.primaryCity}`
      : "Primary service city: (none — do not invent a city)",
    formatNapCardPromptBlock(packet.napCard),
    "",
    "Publish only contact details that appear on the NAP card above.",
    "Use only places that passed this check for the primary service city.",
    "Treat named customers as hypothetical unless the check passed them as sourced.",
  ];
  const rewrites = packet.checks.filter((c) => c.verdict === "rewrite");
  if (rewrites.length) {
    lines.push("", "REWRITTEN CLAIMS (use these; do not restore the originals):");
    for (const row of rewrites) {
      const placeMeta =
        row.kind === "place" && (row.placeType || row.placeCity)
          ? ` [${[row.placeType, row.placeCity].filter(Boolean).join(" / ")}]`
          : "";
      lines.push(
        `- (${row.kind}${placeMeta}) was: ${row.original.trim() || "(empty)"} → now: ${row.rewritten.trim() || "(removed)"}`,
      );
    }
  }
  lines.push("--- END FACT CHECK ---");
  return lines.join("\n");
}

function phoneDigitSet(card: ResearchFactCheckNapCard): string[] {
  return card.phones.map(phoneDigits).filter((d) => d.length >= 7);
}

function extractPhoneDigitRuns(text: string): string[] {
  const runs = text.match(/\+?\d[\d\s().\-]{5,}\d/g) ?? [];
  const out: string[] = [];
  for (const run of runs) {
    const d = phoneDigits(run);
    if (d.length >= 7) out.push(d);
  }
  return out;
}

function phoneOnCard(digits: string, cardPhones: string[]): boolean {
  return cardPhones.some((p) => p === digits || p.endsWith(digits) || digits.endsWith(p));
}

function addressOnCard(text: string, card: ResearchFactCheckNapCard): boolean {
  const lower = text.toLowerCase();
  return card.addresses.some((addr) => {
    const a = addr.toLowerCase().trim();
    if (!a) return false;
    return lower.includes(a) || a.includes(lower.trim());
  });
}

/** Fail fast when a rewrite invents a phone or address off the NAP card. */
export function assertRewrittenNapOnCard(
  checks: ResearchFactCheckItem[],
  card: ResearchFactCheckNapCard,
): void {
  const cardPhones = phoneDigitSet(card);
  for (const check of checks) {
    if (check.verdict !== "rewrite") continue;
    const text = check.rewritten.trim();
    if (!text) continue;

    for (const digits of extractPhoneDigitRuns(text)) {
      if (cardPhones.length === 0) {
        throw new Error(
          "Fact checking failed: rewritten claim introduces a phone but the property NAP card has no phone.",
        );
      }
      if (!phoneOnCard(digits, cardPhones)) {
        throw new Error(
          "Fact checking failed: rewritten phone is not on the property NAP card.",
        );
      }
    }

    if (check.kind === "nap" && card.addresses.length && /\d/.test(text)) {
      const looksLikeStreet =
        /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|court|ct)\b/i.test(
          text,
        );
      if (looksLikeStreet && !addressOnCard(text, card)) {
        throw new Error(
          "Fact checking failed: rewritten address is not on the property NAP card.",
        );
      }
    }
  }
}

function normalizeCheck(raw: z.infer<typeof FactCheckItemModelSchema>): ResearchFactCheckItem {
  const kind = raw.kind as ResearchFactCheckKind;
  const verdict = raw.verdict === "rewrite" ? "rewrite" : "pass";
  const rewritten = String(raw.rewritten ?? "").trim();
  const original = String(raw.original ?? "").trim();
  if (verdict === "rewrite" && rewritten === "" && original === "") {
    throw new Error("Fact checking failed: rewrite check missing original and rewritten text.");
  }
  const placeType = String(raw.placeType ?? "").trim().toLowerCase();
  const placeCity = String(raw.placeCity ?? "").trim();
  return {
    kind,
    original,
    verdict,
    rewritten: verdict === "pass" ? original || rewritten : rewritten,
    reason: String(raw.reason ?? "").trim(),
    ...(placeType && (PLACE_TYPES as readonly string[]).includes(placeType)
      ? { placeType }
      : placeType
        ? { placeType }
        : {}),
    ...(placeCity ? { placeCity } : {}),
  };
}

function applyIllustrativeOverrides(
  existing: IllustrativeExample | undefined,
  overrides: z.infer<typeof FactCheckModelSchema>["illustrativeExample"],
): IllustrativeExample | undefined {
  if (!existing || !overrides) return existing;
  return {
    ...existing,
    ...(overrides.personaName != null
      ? { personaName: String(overrides.personaName).trim() }
      : {}),
    ...(overrides.householdProfile != null
      ? { householdProfile: String(overrides.householdProfile).trim() }
      : {}),
    ...(overrides.situationHook != null
      ? { situationHook: String(overrides.situationHook).trim() }
      : {}),
    ...(overrides.scenarioNarrative != null
      ? { scenarioNarrative: String(overrides.scenarioNarrative).trim() }
      : {}),
    ...(overrides.recommendationParagraph != null
      ? { recommendationParagraph: String(overrides.recommendationParagraph).trim() }
      : {}),
  };
}

export function applyFactCheckToBrief(
  brief: SeoContentBriefV1,
  packet: ResearchFactCheckPacket,
  model: z.infer<typeof FactCheckModelSchema>,
): SeoContentBriefV1 {
  const priorFanout: QueryFanout = brief.queryFanout ?? {
    queries: [],
    namedPrograms: [],
  };
  let firstPartyClaims = brief.firstPartyClaims ?? [];
  if (model.firstPartyClaims) {
    if (model.firstPartyClaims.length !== firstPartyClaims.length) {
      throw new Error(
        "Fact checking failed: firstPartyClaims rewrite length does not match the research brief.",
      );
    }
    firstPartyClaims = model.firstPartyClaims.map((c) => ({
      text: String(c.text ?? "").trim(),
      source: String(c.source ?? "").trim(),
    }));
  }

  let fanout: QueryFanout = {
    ...priorFanout,
    factCheck: packet,
  };

  if (model.illustrativeExample && fanout.illustrativeExample) {
    fanout = {
      ...fanout,
      illustrativeExample: applyIllustrativeOverrides(
        fanout.illustrativeExample,
        model.illustrativeExample,
      ),
    };
  }

  if (model.chatGptTexts && fanout.chatGptByQuery) {
    if (model.chatGptTexts.length !== fanout.chatGptByQuery.length) {
      throw new Error(
        "Fact checking failed: chatGptTexts rewrite length does not match the research brief.",
      );
    }
    fanout = {
      ...fanout,
      chatGptByQuery: fanout.chatGptByQuery.map((row, i) => ({
        ...row,
        responseText: String(model.chatGptTexts?.[i] ?? row.responseText),
      })),
    };
  }

  return {
    ...brief,
    firstPartyClaims,
    queryFanout: fanout,
  };
}

export async function runResearchFactCheck(input: {
  brief: SeoContentBriefV1;
  site?: WordPressSite | null;
  keyword: string;
  title?: string;
  pageExcerpt?: string;
  swotText?: string;
  entity?: string;
  onProgress?: (message: string) => void;
}): Promise<SeoContentBriefV1> {
  input.onProgress?.(FACT_CHECKING_STEP_LABEL);

  const napCard = buildNapCardFromSite(input.site);
  const local = resolvePageLocalContext({
    keyword: input.keyword,
    site: input.site,
    entity: input.entity,
  });
  const primaryCity = local.primaryCity.trim();
  const claims = input.brief.firstPartyClaims ?? [];
  const illustrative = input.brief.queryFanout?.illustrativeExample;
  const chatGptTexts = (input.brief.queryFanout?.chatGptByQuery ?? []).map(
    (r) => r.responseText ?? "",
  );
  const chatGptJoined = [
    ...chatGptTexts.map((t) => t.trim()).filter(Boolean),
    input.swotText?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const model = getResearchModel(input.site?.id);
  const userLines = [
    formatNapCardPromptBlock(napCard),
    "",
    `Primary service city: ${primaryCity || "(none)"}`,
    local.placeEntity ? `Place entity (SAP): ${local.placeEntity}` : "",
    `Keyword: ${input.keyword.trim()}`,
    `Title: ${(input.title ?? "").trim() || input.keyword.trim()}`,
    "",
    "--- FIRST-PARTY CLAIMS ---",
    claims.length
      ? claims.map((c, i) => `[${i}] ${c.text} (source: ${c.source})`).join("\n")
      : "(none)",
    "--- END FIRST-PARTY CLAIMS ---",
    "",
    "--- ILLUSTRATIVE EXAMPLE ---",
    illustrative
      ? [
          `personaName: ${illustrative.personaName ?? ""}`,
          `householdProfile: ${illustrative.householdProfile ?? ""}`,
          `situationHook: ${illustrative.situationHook ?? ""}`,
          `scenarioNarrative: ${illustrative.scenarioNarrative ?? ""}`,
          `recommendationParagraph: ${illustrative.recommendationParagraph ?? ""}`,
        ].join("\n")
      : "(none)",
    "--- END ILLUSTRATIVE EXAMPLE ---",
    "",
    "--- CHATGPT / SWOT RESEARCH ---",
    chatGptJoined || "(none)",
    "--- END CHATGPT / SWOT RESEARCH ---",
    "",
    "--- PAGE EXCERPT ---",
    input.pageExcerpt?.trim() || "(none)",
    "--- END PAGE EXCERPT ---",
  ].filter((line) => line !== "");

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: FACT_CHECK_SYSTEM,
    user: userLines.join("\n"),
    maxTokens: topicResearchFanoutMaxTokens(model),
    temperature: 0,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "research_fact_check",
        strict: false,
        schema: FACT_CHECK_SCHEMA,
      },
    },
  });

  const parsed = parseModelJson(content, FactCheckModelSchema, "research fact check");
  const checks = (parsed.checks ?? []).map(normalizeCheck);
  assertRewrittenNapOnCard(checks, napCard);

  const packet: ResearchFactCheckPacket = {
    checkedAt: new Date().toISOString(),
    primaryCity,
    napCard,
    checks,
  };

  return applyFactCheckToBrief(input.brief, packet, parsed);
}
