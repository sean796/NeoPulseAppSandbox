import { describe, expect, it, vi } from "vitest";
import {
  isSkippableFaqHarnessSection,
  runHarnessSectionIsolated,
} from "@/lib/bulk/harness-section-isolation";

describe("isSkippableFaqHarnessSection", () => {
  it("matches FAQ-style titles", () => {
    expect(isSkippableFaqHarnessSection("FAQ")).toBe(true);
    expect(isSkippableFaqHarnessSection("Frequently Asked Questions")).toBe(true);
    expect(isSkippableFaqHarnessSection("Common Questions About Blinds")).toBe(true);
  });

  it("does not match normal body titles", () => {
    expect(isSkippableFaqHarnessSection("Answer")).toBe(false);
    expect(isSkippableFaqHarnessSection("Overview")).toBe(false);
    expect(isSkippableFaqHarnessSection("Corporate Tax Planning Checklist")).toBe(false);
  });
});

describe("runHarnessSectionIsolated", () => {
  it("returns HTML on first success without retry", async () => {
    const run = vi.fn().mockResolvedValue("<h2>Answer</h2><p>Fact one. Fact two.</p>");
    const onProgress = vi.fn();
    const result = await runHarnessSectionIsolated({
      title: "Answer",
      run,
      onProgress,
    });
    expect(result).toEqual({
      html: "<h2>Answer</h2><p>Fact one. Fact two.</p>",
      dropped: false,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("skips FAQ on failure without retry", async () => {
    const run = vi.fn().mockRejectedValue(new Error('Harness: section "FAQ" produced no HTML'));
    const onProgress = vi.fn();
    const result = await runHarnessSectionIsolated({
      title: "FAQ",
      run,
      onProgress,
    });
    expect(result).toEqual({ html: "", dropped: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith('Skipping FAQ section "FAQ"; posting the rest.');
  });

  it("retries a non-FAQ section once and keeps the retry HTML", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('Harness: section "Cost" returned no content'))
      .mockResolvedValueOnce("<h2>Cost</h2><p>Band one. Band two.</p>");
    const onProgress = vi.fn();
    const result = await runHarnessSectionIsolated({
      title: "Cost",
      run,
      onProgress,
    });
    expect(result).toEqual({
      html: "<h2>Cost</h2><p>Band one. Band two.</p>",
      dropped: false,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith('Retrying section "Cost" once…');
  });

  it("drops a non-FAQ section after the retry also fails", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('Harness: section "Cost" returned no content'))
      .mockRejectedValueOnce(new Error('Harness: section "Cost" produced no HTML'));
    const onProgress = vi.fn();
    const result = await runHarnessSectionIsolated({
      title: "Cost",
      run,
      onProgress,
    });
    expect(result).toEqual({ html: "", dropped: true });
    expect(run).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith('Retrying section "Cost" once…');
    expect(onProgress).toHaveBeenCalledWith(
      'Dropped section "Cost" after one retry; posting the rest.',
    );
  });
});
