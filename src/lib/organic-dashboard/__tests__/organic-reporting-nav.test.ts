import { describe, expect, it, vi } from "vitest";
import {
  NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT,
  isIndexShellPath,
  openOrganicReporting,
} from "@/lib/organic-dashboard/organic-reporting-nav";

describe("organic reporting navigation", () => {
  it("treats property dashboard paths as the app shell", () => {
    expect(isIndexShellPath("/")).toBe(true);
    expect(isIndexShellPath("/dashboard/advance-blinds")).toBe(true);
    expect(isIndexShellPath("/organic-reporting")).toBe(true);
    expect(isIndexShellPath("/sites/site-1/organic")).toBe(false);
  });

  it("opens Performance in place from the property dashboard", () => {
    const navigate = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    openOrganicReporting(navigate, "/dashboard/advance-blinds", "site-1");
    expect(navigate).not.toHaveBeenCalled();
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{ siteId: string }>;
    expect(event.type).toBe(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT);
    expect(event.detail).toEqual({ siteId: "site-1" });
    vi.unstubAllGlobals();
  });

  it("uses the dedicated route only outside the app shell", () => {
    const navigate = vi.fn();
    openOrganicReporting(navigate, "/sites/other/organic", "site-1");
    expect(navigate).toHaveBeenCalledWith("/sites/site-1/organic", { flushSync: true });
  });
});
