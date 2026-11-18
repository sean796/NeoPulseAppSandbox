import { describe, expect, it } from "vitest";
import { siteUsesWindowTreatmentsSkill } from "../site-uses-window-treatments-skill";

describe("siteUsesWindowTreatmentsSkill", () => {
  it("matches Window treatments tag", () => {
    expect(
      siteUsesWindowTreatmentsSkill({
        id: "1",
        name: "Blind Magic",
        siteUrl: "https://blindmagic.com",
        benchmarkCustomTag: "Window treatments",
      }),
    ).toBe(true);
  });

  it("matches known Window treatments host without tag", () => {
    expect(
      siteUsesWindowTreatmentsSkill({
        id: "1",
        name: "Blind Magic",
        siteUrl: "https://blindmagic.com",
      }),
    ).toBe(true);
  });

  it("includes Tailored Interiors", () => {
    expect(
      siteUsesWindowTreatmentsSkill({
        id: "1",
        name: "Tailored Interiors",
        siteUrl: "https://tailoredinteriors.ca",
        benchmarkCustomTag: "Interior design",
      }),
    ).toBe(true);
  });

  it("includes Interiors by Laura", () => {
    expect(
      siteUsesWindowTreatmentsSkill({
        id: "1",
        name: "Interiors by Laura",
        siteUrl: "https://interiorsbylaura.com",
        benchmarkCustomTag: "Interior design",
      }),
    ).toBe(true);
  });

  it("excludes painting and agency clients", () => {
    expect(
      siteUsesWindowTreatmentsSkill({
        id: "1",
        name: "Phoenix Painting",
        siteUrl: "https://phoenixpainting.ca",
        benchmarkCustomTag: "Painting",
      }),
    ).toBe(false);
    expect(
      siteUsesWindowTreatmentsSkill({
        id: "2",
        name: "Neo Digital",
        siteUrl: "https://neodigital.ca",
        benchmarkCustomTag: "Digital marketing",
      }),
    ).toBe(false);
  });

  it("returns false for null site", () => {
    expect(siteUsesWindowTreatmentsSkill(null)).toBe(false);
  });
});
