import { describe, expect, it } from "vitest";
import {
  CAREER_APPLICATION_QUESTIONS,
  INITIAL_FLAWED_ARTIFACT,
  type ProjectRoomArtifact,
} from "@/components/careers/career-role-data";
import { validateProjectRoomArtifact } from "@/lib/careers/careers-api";

describe("NEO Pulse Operator Career Application & Project Room Contract", () => {
  it("includes all 15 application questions from the specification", () => {
    expect(CAREER_APPLICATION_QUESTIONS).toHaveLength(15);
    expect(CAREER_APPLICATION_QUESTIONS[0]?.id).toBe("q1");
    expect(CAREER_APPLICATION_QUESTIONS[14]?.id).toBe("q15");
  });

  it("rejects the initial seeded flawed artifact on all 5 contract checks", () => {
    const result = validateProjectRoomArtifact(INITIAL_FLAWED_ARTIFACT);
    expect(result.allPassed).toBe(false);
    expect(result.passedCount).toBe(0);
    expect(result.totalCount).toBe(5);
  });

  it("passes all 5 contract checks when the operator steers to Shutter Spot, server route, and staging HITL", () => {
    const validArtifact: ProjectRoomArtifact = {
      publicBrandName: "Shutter Spot",
      focusKeyword: "custom plantation shutters calgary",
      seoTitle: "Custom Plantation Shutters Calgary by Shutter Spot",
      metaDescription:
        "Upgrade your home with custom plantation shutters calgary homeowners trust from Shutter Spot. Book a free in-home consultation and measure in Calgary today.",
      executionRoute: "/api/wordpress/update-post-meta",
      targetEnvironment: "staging",
      stagingVerificationStep:
        "Pause for operator approval in Pulse UI before staging publish, then read post meta back via WordPress REST API to confirm fields updated.",
    };

    const result = validateProjectRoomArtifact(validArtifact);
    expect(result.allPassed).toBe(true);
    expect(result.passedCount).toBe(5);
  });

  it("fails the brand check if Blind Spot appears in seoTitle or metaDescription even when publicBrandName is Shutter Spot", () => {
    const leakedBrandArtifact: ProjectRoomArtifact = {
      publicBrandName: "Shutter Spot",
      focusKeyword: "custom plantation shutters calgary",
      seoTitle: "Custom Plantation Shutters Calgary by Blind Spot",
      metaDescription:
        "Upgrade your home with custom plantation shutters calgary homeowners trust from Shutter Spot. Book a free in-home consultation and measure in Calgary today.",
      executionRoute: "/api/wordpress/update-post-meta",
      targetEnvironment: "staging",
      stagingVerificationStep:
        "Pause for operator approval in Pulse UI before staging publish, then read post meta back via WordPress REST API.",
    };

    const result = validateProjectRoomArtifact(leakedBrandArtifact);
    expect(result.allPassed).toBe(false);
    const brandCheck = result.checks.find((c) => c.id === "canonical_brand");
    expect(brandCheck?.passed).toBe(false);
  });
});
