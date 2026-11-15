import { describe, expect, it } from "vitest";
import { mergeAutomationRecipeCatalog } from "@/lib/automation-recipes-catalog";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";

describe("automation-recipes-catalog", () => {
  it("includes bundled entity page creator recipes under local-seo", () => {
    const fromApi: AutomationRecipeCatalogItem[] = [
      {
        keyword: "entity-sap-guardian",
        name: "Entity SAP Guardian",
        description: "Legacy API entry",
        isAutomation: true,
        category: "local-seo",
        verticals: ["local-seo"],
        tags: [],
        prerequisites: ["gsc"],
        filters: { executionKinds: ["content_optimizer"], targetBuckets: ["sap"] },
      },
    ];

    const merged = mergeAutomationRecipeCatalog(fromApi);
    const keywords = merged.map((recipe) => recipe.keyword);

    expect(keywords).toContain("ads-monthly-mom-report");
    expect(keywords).toContain("ads-monthly-yoy-report");
    expect(keywords).toContain("entity-page-creator-monthly");
    expect(keywords).not.toContain("grid-to-entity-to-sap-monthly");
    expect(keywords).not.toContain("entity-to-sap-monthly");
    expect(keywords).not.toContain("missing-template-aiseo");
    expect(keywords).not.toContain("blog-content-gap-check-monthly");

    const localSeo = merged.filter((recipe) => recipe.category === "local-seo");
    expect(localSeo.some((recipe) => recipe.keyword === "entity-page-creator-monthly")).toBe(true);
    expect(localSeo.some((recipe) => recipe.keyword === "grid-to-entity-to-sap-monthly")).toBe(false);
  });
});
