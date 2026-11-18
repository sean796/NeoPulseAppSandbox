import { describe, expect, it } from "vitest";
import {
  defaultSplashStatusForStep,
  FACT_CHECKER_SPLASH_STATUS,
  FACT_CHECKING_SPLASH_STATUS,
  isFactCheckerSplashStep,
  isFactCheckingSplashStep,
} from "../use-bulk-splash-ai-status";

describe("defaultSplashStatusForStep", () => {
  it("maps Blog Ideas steps to curating blog post ideas", () => {
    expect(defaultSplashStatusForStep("Generating blog ideas").status).toBe(
      "Curating blog post ideas",
    );
    expect(defaultSplashStatusForStep("Generating blog ideas").visual).toBe("ideas");
  });

  it("keeps the Fact checking label and factcheck graphic exact", () => {
    expect(isFactCheckingSplashStep("Fact checking")).toBe(true);
    expect(defaultSplashStatusForStep("Fact checking")).toEqual(FACT_CHECKING_SPLASH_STATUS);
    expect(defaultSplashStatusForStep("Fact checking").status).toBe("Fact checking");
    expect(defaultSplashStatusForStep("Fact checking").visual).toBe("factcheck");
  });

  it("keeps the Fact checker label and factchecker graphic exact", () => {
    expect(isFactCheckerSplashStep("Fact checker")).toBe(true);
    expect(defaultSplashStatusForStep("Fact checker")).toEqual(FACT_CHECKER_SPLASH_STATUS);
    expect(defaultSplashStatusForStep("Fact checker").status).toBe("Fact checker");
    expect(defaultSplashStatusForStep("Fact checker").visual).toBe("factchecker");
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
