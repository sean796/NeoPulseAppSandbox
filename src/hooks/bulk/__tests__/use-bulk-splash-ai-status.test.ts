import { describe, expect, it } from "vitest";
import { defaultSplashStatusForStep } from "../use-bulk-splash-ai-status";

describe("defaultSplashStatusForStep", () => {
  it("maps Blog Ideas steps to curating blog post ideas", () => {
    expect(defaultSplashStatusForStep("Generating blog ideas").status).toBe(
      "Curating blog post ideas",
    );
    expect(defaultSplashStatusForStep("Generating blog ideas").visual).toBe("ideas");
  });

  it("does not treat content checklist or CSV steps as blog idea curation", () => {
    expect(defaultSplashStatusForStep("Generating checklist...").visual).toBe("writing");
    expect(defaultSplashStatusForStep("Generating checklist...").status).not.toMatch(
      /blog post ideas/i,
    );
    expect(defaultSplashStatusForStep("Reading CSV").visual).toBe("writing");
    expect(defaultSplashStatusForStep("Building blueprint").visual).toBe("writing");
  });
});
