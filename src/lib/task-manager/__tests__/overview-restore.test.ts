import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildAutoSeoTaskHref,
  parseOverviewClientNameFromSearch,
  parseOverviewSourceFromPath,
  resolveSiteIdByClientName,
} from "@/lib/task-manager/overview-restore";

describe("overview-restore task href", () => {
  it("puts source and client NAME in the URL (not a site id)", () => {
    const href = buildAutoSeoTaskHref("posts", "In the Shade");
    expect(href).toContain("/generator/opt?");
    expect(href).toContain("source=posts");
    expect(href).toContain("client=In+the+Shade");
    expect(href).not.toContain("wp-");
    expect(parseOverviewSourceFromPath("/generator/opt", href.slice(href.indexOf("?")))).toBe(
      "posts",
    );
    expect(parseOverviewClientNameFromSearch(href.slice(href.indexOf("?")))).toBe("In the Shade");
  });

  it("resolves connected site by client name", () => {
    const sites = [
      { id: "wp-1", name: "Blind Magic", napInfo: { name: "Blind Magic" } },
      { id: "wp-2", name: "In the Shade", napInfo: { name: "In the Shade Florida" } },
    ] as WordPressSite[];
    expect(resolveSiteIdByClientName(sites, "In the Shade")).toBe("wp-2");
    expect(resolveSiteIdByClientName(sites, "in the shade")).toBe("wp-2");
    expect(resolveSiteIdByClientName(sites, "wp-2")).toBeNull();
  });
});
