import { afterEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import * as storage from "@/components/integrations/storage";
import type { AgentRun } from "@/lib/agent-runs-types";
import {
  loadSitesForAgentRun,
  mergeAgentRunSiteFromSeed,
  pinAgentRunSiteId,
  resolveAgentRunSiteIds,
  resolveAgentRunWordPressSite,
  resolveGscReportingSite,
} from "@/lib/agent-runs/resolve-agent-run-site";

function site(id: string, name: string): WordPressSite {
  return { id, name, siteUrl: `https://${id}.example` } as WordPressSite;
}

function run(partial: Partial<AgentRun>): AgentRun {
  return {
    id: 1489,
    teamId: 1,
    recipeKey: "gsc_reporting",
    status: "running",
    context: {},
    ...partial,
  } as AgentRun;
}

describe("resolveAgentRunSiteIds", () => {
  it("prefers the agent context site over contract", () => {
    const ids = resolveAgentRunSiteIds(
      run({
        context: { siteId: "ridgeline" },
        plan: {
          clientRunContract: { siteId: "header-site" } as never,
          executionPayload: { siteId: "ridgeline" } as never,
        },
      }),
    );
    expect(ids[0]).toBe("ridgeline");
    expect(ids).toContain("header-site");
  });

  it("reads payload site when context is empty", () => {
    expect(
      resolveAgentRunSiteIds(
        run({
          context: {},
          plan: { executionPayload: { wordpressSiteId: "ridgeline" } as never },
        }),
      ),
    ).toEqual(["ridgeline"]);
  });
});

describe("resolveAgentRunWordPressSite", () => {
  it("resolves the workflow client from the connected sites list", () => {
    const ridgeline = site("ridgeline", "Ridgeline Solar");
    const found = resolveAgentRunWordPressSite(
      run({ context: { siteId: "ridgeline" } }),
      [site("other", "Other"), ridgeline],
    );
    expect(found).toBe(ridgeline);
  });

  it("uses payload site when context id is not in the connected list", () => {
    const ridgeline = site("ridgeline", "Ridgeline Solar");
    const found = resolveAgentRunWordPressSite(
      run({
        context: { siteId: "stale-header" },
        plan: { executionPayload: { siteId: "ridgeline" } as never },
      }),
      [ridgeline],
    );
    expect(found.id).toBe("ridgeline");
  });

  it("does not require a header active site", () => {
    expect(() =>
      resolveAgentRunWordPressSite(run({ context: {} }), [site("ridgeline", "Ridgeline Solar")]),
    ).toThrow(/WordPress site not found for this task/);
  });

  it("pins a workflow client onto a run that lost its site id", () => {
    const ridgeline = site("ridgeline", "Ridgeline Solar");
    const seeded = pinAgentRunSiteId(run({ context: {} }), "ridgeline");
    const fetched = run({
      id: 99,
      context: {},
      plan: { clientRunContract: { siteId: "" } as never },
    });
    const merged = mergeAgentRunSiteFromSeed(fetched, seeded);
    expect(resolveAgentRunWordPressSite(merged, [ridgeline]).id).toBe("ridgeline");
  });
});

describe("resolveGscReportingSite", () => {
  it("uses a connected row when the agent already has that site", () => {
    const ridgeline = site("ridgeline", "Ridgeline Solar");
    expect(resolveGscReportingSite(run({ context: { siteId: "ridgeline" } }), [ridgeline])).toBe(ridgeline);
  });

  it("does not fail when no WordPress row exists", () => {
    const stub = resolveGscReportingSite(
      run({
        context: { siteId: "ridgeline" },
        plan: { executionPayload: { businessName: "Ridgeline Solar", siteUrl: "https://ridgelinesolar.ca" } as never },
      }),
      [],
    );
    expect(stub.name).toBe("Ridgeline Solar");
    expect(stub.siteUrl).toBe("https://ridgelinesolar.ca");
  });

  it("uses the connected client row by name when the run has no site id", () => {
    const ridgeline = site("ridgeline", "Ridgeline Solar");
    expect(
      resolveGscReportingSite(
        run({
          context: {},
          plan: { executionPayload: { businessName: "Ridgeline Solar" } as never },
        }),
        [ridgeline],
      ),
    ).toBe(ridgeline);
  });

  it("uses productionSiteUrl from the connected client when siteUrl is empty", () => {
    const ridgeline = {
      ...site("ridgeline", "Ridgeline Solar"),
      siteUrl: "",
      productionSiteUrl: "https://ridgelinesolar.ca",
    };
    const found = resolveGscReportingSite(run({ context: { siteId: "ridgeline" } }), [ridgeline]);
    expect(found).toBe(ridgeline);
    expect(found.productionSiteUrl).toBe("https://ridgelinesolar.ca");
  });
});

describe("loadSitesForAgentRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the connected list when the run site is already there", async () => {
    const ridgeline = site("wp-1786635952128-13", "Ridgeline Solar");
    const mirror = vi.spyOn(storage, "fetchWordPressSitesMirror");
    const pool = await loadSitesForAgentRun(
      run({ context: { siteId: "wp-1786635952128-13" } }),
      [ridgeline],
    );
    expect(pool.some((row) => row.id === "wp-1786635952128-13")).toBe(true);
    expect(mirror).not.toHaveBeenCalled();
  });

  it("loads the server mirror when the run site is missing from the browser list", async () => {
    const ridgeline = site("wp-1786635952128-13", "Ridgeline Solar");
    vi.spyOn(storage, "getStoredSites").mockReturnValue([]);
    vi.spyOn(storage, "loadSitesFromServerAlways").mockResolvedValue([]);
    vi.spyOn(storage, "fetchWordPressSitesMirror").mockResolvedValue([ridgeline]);
    const pool = await loadSitesForAgentRun(
      run({ context: { siteId: "wp-1786635952128-13" } }),
      [],
    );
    expect(pool.find((row) => row.id === "wp-1786635952128-13")?.name).toBe("Ridgeline Solar");
  });
});
