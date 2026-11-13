import { describe, expect, it } from "vitest";
import { overviewStudioUrlBoxLabel } from "../overview-studio-url-box-label";

describe("overviewStudioUrlBoxLabel", () => {
  it("shows path only with no domain", () => {
    expect(
      overviewStudioUrlBoxLabel({
        pathLabel: "https://www.customshadesoflondon.ca/service-area/hyde-park/",
        sitemapSource: "sap",
      }),
    ).toBe("/service-area/hyde-park/");
  });

  it("uses /post when idle on posts", () => {
    expect(
      overviewStudioUrlBoxLabel({
        pathLabel: "/",
        sitemapSource: "posts",
      }),
    ).toBe("/post");
  });

  it("uses /service-area when idle on SAP", () => {
    expect(
      overviewStudioUrlBoxLabel({
        pathLabel: "https://www.customshadesoflondon.ca/",
        sitemapSource: "sap",
      }),
    ).toBe("/service-area");
  });

  it("uses / when idle on pages", () => {
    expect(
      overviewStudioUrlBoxLabel({
        pathLabel: "/",
        sitemapSource: "pages",
      }),
    ).toBe("/");
  });
});
