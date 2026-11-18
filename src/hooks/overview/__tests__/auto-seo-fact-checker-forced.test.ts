import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FACT_CHECKER_STEP_LABEL } from "@/lib/content-generation/product-fact-checker";

describe("Auto SEO forces Fact checker every run", () => {
  const hookSource = readFileSync(
    resolve(__dirname, "../use-overview-tab-auto-seo-optimize-all.ts"),
    "utf8",
  );

  it("imports and calls runProductFactChecker before upload", () => {
    expect(hookSource).toContain('from "@/lib/content-generation/product-fact-checker"');
    expect(hookSource).toContain("runProductFactChecker");
    expect(hookSource).toContain("FACT_CHECKER_STEP_LABEL");
    expect(hookSource).toContain("AUTO_SEO_STEP_FACT_CHECKER");
    expect(hookSource).toContain("insertResearchAndFactCheckingDisclosure");
    expect(hookSource).toContain("Fact checker on every run");
    // Upload is step 5; Fact checker is step 4
    expect(hookSource).toContain("AUTO_SEO_STEPS_PER_POST = 5");
    expect(hookSource).toMatch(/setStepTelemetry\(\s*url,\s*pos,\s*4,\s*AUTO_SEO_STEPS_PER_POST,\s*AUTO_SEO_STEP_FACT_CHECKER/);
    expect(hookSource).toMatch(/setStepTelemetry\(\s*url,\s*pos,\s*5,\s*AUTO_SEO_STEPS_PER_POST,\s*AUTO_SEO_STEP_UPLOAD/);
  });

  it("uses the exact Fact checker splash label", () => {
    expect(FACT_CHECKER_STEP_LABEL).toBe("Fact checker");
    expect(hookSource).toContain("AUTO_SEO_STEP_FACT_CHECKER = FACT_CHECKER_STEP_LABEL");
  });
});
