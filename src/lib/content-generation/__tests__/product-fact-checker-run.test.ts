import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACT_CHECK_REWRITE_ATTEMPTS } from "../product-fact-checker";

const postOpenRouterAppChat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openrouter-app-api", () => ({
  postOpenRouterAppChat,
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(async () => "test-key"),
}));

import { runProductFactChecker } from "../product-fact-checker";

const REPEATED = "Standard three-panel bay windows typically span 126 to 184 inches.";
const UNIQUE = `Framing note. ${REPEATED}`;

function editJson(quote: string): string {
  return JSON.stringify({
    edits: [
      {
        quote,
        verdict: "supported",
        replacement: "Bay span depends on the manufacturer specification.",
        anchor: "manufacturer specification",
        sourceUrl: "https://www.hunterdouglas.com/bay-windows",
        sourceTitle: "Hunter Douglas",
        qualification: "",
      },
    ],
    unhandledQuotes: [],
  });
}

describe("runProductFactChecker", () => {
  beforeEach(() => {
    postOpenRouterAppChat.mockReset();
  });

  it("rewrites a repeated quote and finishes the post", async () => {
    const html = `<p>${REPEATED}</p><p>${UNIQUE}</p>`;
    const progress: string[] = [];
    postOpenRouterAppChat
      .mockResolvedValueOnce({ content: editJson(REPEATED) })
      .mockResolvedValueOnce({ content: editJson(UNIQUE) });

    const out = await runProductFactChecker({
      html,
      keyword: "bay window blinds",
      title: "Framing the perfect bay window blinds visual",
      onProgress: (message) => progress.push(message),
    });

    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(2);
    const retryUser = String(postOpenRouterAppChat.mock.calls[1][0].user);
    expect(retryUser).toContain("quote appears more than once");
    expect(retryUser).toContain("PREVIOUS ATTEMPT REJECTED");
    expect(out).toContain(REPEATED);
    expect(out).toContain("manufacturer specification");
    expect(out).not.toContain(UNIQUE);
    expect(progress).toContain("Fact checker: rewriting quotes");
  });

  it("still finishes when every rewrite repeats the same quote", async () => {
    const html = `<p>${REPEATED}</p><p>Later. ${REPEATED}</p>`;
    postOpenRouterAppChat.mockResolvedValue({ content: editJson(REPEATED) });

    const out = await runProductFactChecker({ html });

    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(FACT_CHECK_REWRITE_ATTEMPTS);
    expect(out.match(/manufacturer specification/g)).toHaveLength(2);
    expect(out).not.toContain(REPEATED);
  });

  it("soft-finishes after qualification mismatches instead of gating the blog", async () => {
    const quote =
      "Steel measuring tapes provide the required accuracy when recording window dimensions.";
    const html = `<p>${quote} Nearby stays.</p>`;
    const badJson = JSON.stringify({
      edits: [
        {
          quote,
          verdict: "partially_supported",
          replacement: "Steel measuring tapes are used for window openings.",
          anchor: "Steel measuring tapes",
          sourceUrl: "https://www.nist.gov/pml/owm",
          sourceTitle: "NIST",
          qualification: "accuracy depends on tape class and technique",
        },
      ],
      unhandledQuotes: [],
    });
    postOpenRouterAppChat.mockResolvedValue({ content: badJson });
    const progress: string[] = [];

    const out = await runProductFactChecker({
      html,
      onProgress: (message) => progress.push(message),
    });

    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(FACT_CHECK_REWRITE_ATTEMPTS);
    const retryUser = String(postOpenRouterAppChat.mock.calls[1][0].user);
    expect(retryUser).toContain("qualification must appear in replacement");
    expect(retryUser).toContain("Never fail the post");
    expect(out).not.toContain("Steel measuring tapes");
    expect(out).toContain("Nearby stays.");
    expect(progress).toContain("Fact checker: omitting unverified claims");
  });
});
