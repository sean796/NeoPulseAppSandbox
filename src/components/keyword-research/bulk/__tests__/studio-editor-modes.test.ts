import { describe, expect, it } from "vitest";
import {
  blogGeneratorSectionForStudioMode,
  isStudioEditorModeId,
  readStoredStudioEditorMode,
  STUDIO_EDITOR_MODE_OPTIONS,
} from "../studio-editor-modes";

describe("studio-editor-modes", () => {
  it("lists Import Studio under Blog Ideas and has no CSV Studio entry", () => {
    const ids = STUDIO_EDITOR_MODE_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      "prompt",
      "blog-import",
      "vertical-benchmarks",
      "press-release",
    ]);
    expect(STUDIO_EDITOR_MODE_OPTIONS.find((o) => o.id === "blog-import")?.label).toBe(
      "Import Studio",
    );
    expect(ids.includes("csv" as never)).toBe(false);
    for (const id of ids) {
      expect(isStudioEditorModeId(id)).toBe(true);
    }
    expect(isStudioEditorModeId("csv")).toBe(false);
    expect(isStudioEditorModeId("research-citation")).toBe(false);
  });

  it("maps studio modes to BlogGeneratorSectionId", () => {
    expect(blogGeneratorSectionForStudioMode("prompt")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("blog-import")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("vertical-benchmarks")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("press-release")).toBe("bulk-press-release");
  });

  it("resolves initial studio editor mode from activeSection", () => {
    expect(readStoredStudioEditorMode("bulk-press-release")).toBe("press-release");
    expect(readStoredStudioEditorMode("bulk-csv")).toBe("blog-import");
    expect(readStoredStudioEditorMode("bulk-blog-import")).toBe("blog-import");
    expect(readStoredStudioEditorMode("bulk-prompt")).toBe("prompt");
  });
});
