import { describe, expect, it } from "vitest";
import {
  bulkComposeSplashVisible,
  importStudioLoadSplashStep,
} from "../bulk-compose-splash-visibility";
import { defaultSplashStatusForStep } from "@/hooks/bulk/use-bulk-splash-ai-status";

describe("bulkComposeSplashVisible", () => {
  const base = {
    showModeComposeScreen: true,
    isGeneratingChecklist: false,
    hasGeneratedChecklist: false,
    filesByRowEmpty: true,
    importParsing: false,
    csvLoading: false,
    csvEnrichingTitlesUrls: false,
    hasImportFile: false,
  };

  it("keeps Blog Ideas splash while checklist generates", () => {
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "prompt",
        isGeneratingChecklist: true,
      }),
    ).toBe(true);
  });

  it("keeps Blog Ideas splash after checklist until files exist", () => {
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "prompt",
        hasGeneratedChecklist: true,
        filesByRowEmpty: true,
      }),
    ).toBe(true);
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "prompt",
        hasGeneratedChecklist: true,
        filesByRowEmpty: false,
      }),
    ).toBe(false);
  });

  it("shows Import splash during CSV read, enrich, and draft parse", () => {
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "blog-import",
        csvLoading: true,
      }),
    ).toBe(true);
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "blog-import",
        csvEnrichingTitlesUrls: true,
      }),
    ).toBe(true);
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "blog-import",
        importParsing: true,
      }),
    ).toBe(true);
  });

  it("keeps Import splash after file is ready until row files exist", () => {
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "blog-import",
        hasImportFile: true,
        filesByRowEmpty: true,
      }),
    ).toBe(true);
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "blog-import",
        hasImportFile: true,
        filesByRowEmpty: false,
      }),
    ).toBe(false);
  });

  it("hides Import splash when idle with no file", () => {
    expect(
      bulkComposeSplashVisible({
        ...base,
        studioEditorMode: "blog-import",
      }),
    ).toBe(false);
  });

  it("never shows compose splash when compose screen is hidden", () => {
    expect(
      bulkComposeSplashVisible({
        ...base,
        showModeComposeScreen: false,
        studioEditorMode: "blog-import",
        hasImportFile: true,
        csvLoading: true,
      }),
    ).toBe(false);
  });
});

describe("importStudioLoadSplashStep", () => {
  it("prefers enrich, then CSV read, then draft parse, then hold", () => {
    expect(
      importStudioLoadSplashStep({
        importParsing: true,
        csvLoading: true,
        csvEnrichingTitlesUrls: true,
      }),
    ).toBe("Optimizing titles & URLs");
    expect(
      importStudioLoadSplashStep({
        importParsing: true,
        csvLoading: true,
        csvEnrichingTitlesUrls: false,
      }),
    ).toBe("Reading CSV");
    expect(
      importStudioLoadSplashStep({
        importParsing: true,
        csvLoading: false,
        csvEnrichingTitlesUrls: false,
      }),
    ).toBe("Parsing draft articles");
    expect(
      importStudioLoadSplashStep({
        importParsing: false,
        csvLoading: false,
        csvEnrichingTitlesUrls: false,
        hasImportFile: true,
      }),
    ).toBe("Waiting for approval");
  });
});

describe("defaultSplashStatusForStep import heuristics", () => {
  it("maps CSV and draft parse steps to writing visuals", () => {
    expect(defaultSplashStatusForStep("Reading CSV").visual).toBe("writing");
    expect(defaultSplashStatusForStep("Parsing draft articles").visual).toBe("writing");
  });

  it("maps title/URL enrich to meta visual", () => {
    expect(defaultSplashStatusForStep("Optimizing titles & URLs").visual).toBe("meta");
  });
});
