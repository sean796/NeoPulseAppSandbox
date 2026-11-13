import { describe, expect, it } from "vitest";
import {
  AUTO_SEO_CONTENT_CONCURRENCY,
  AUTO_SEO_RESEARCH_CONCURRENCY,
  AUTO_SEO_RESEARCH_READY_BUFFER,
  runAutoSeoResearchContentPipeline,
} from "@/lib/overview/overview-auto-seo-research-content-pipeline";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runAutoSeoResearchContentPipeline", () => {
  it("holds content until prefer-2 research buffer is warm, then runs content x3", async () => {
    const researchOrder: number[] = [];
    const contentStarts: number[] = [];
    let contentInFlight = 0;
    let maxContentInFlight = 0;
    let researchInFlight = 0;
    let maxResearchInFlight = 0;
    let contentOpenedAfterReady = 0;

    const posts = Array.from({ length: 6 }, (_, i) => ({ idx: i, pos: i }));
    let readyCount = 0;

    await runAutoSeoResearchContentPipeline({
      posts,
      readyBuffer: AUTO_SEO_RESEARCH_READY_BUFFER,
      researchConcurrency: AUTO_SEO_RESEARCH_CONCURRENCY,
      contentConcurrency: AUTO_SEO_CONTENT_CONCURRENCY,
      isCurrent: () => true,
      runResearch: async (post) => {
        researchInFlight += 1;
        maxResearchInFlight = Math.max(maxResearchInFlight, researchInFlight);
        researchOrder.push(post.pos);
        await delay(30);
        researchInFlight -= 1;
        readyCount += 1;
        return `digest-${post.pos}`;
      },
      runContent: async (job) => {
        if (contentStarts.length === 0) {
          contentOpenedAfterReady = readyCount;
        }
        contentStarts.push(job.pos);
        contentInFlight += 1;
        maxContentInFlight = Math.max(maxContentInFlight, contentInFlight);
        await delay(40);
        contentInFlight -= 1;
      },
    });

    expect(contentOpenedAfterReady).toBeGreaterThanOrEqual(AUTO_SEO_RESEARCH_READY_BUFFER);
    expect(maxResearchInFlight).toBeLessThanOrEqual(AUTO_SEO_RESEARCH_CONCURRENCY);
    expect(maxContentInFlight).toBeLessThanOrEqual(AUTO_SEO_CONTENT_CONCURRENCY);
    expect(contentStarts).toHaveLength(6);
    expect(researchOrder).toHaveLength(6);
  });

  it("opens content after available ready count when posts < buffer", async () => {
    const contentStarts: number[] = [];
    await runAutoSeoResearchContentPipeline({
      posts: [{ idx: 0, pos: 0 }],
      readyBuffer: 2,
      isCurrent: () => true,
      runResearch: async () => "only",
      runContent: async (job) => {
        contentStarts.push(job.pos);
      },
    });
    expect(contentStarts).toEqual([0]);
  });

  it("skips content when research returns null", async () => {
    const contentStarts: number[] = [];
    await runAutoSeoResearchContentPipeline({
      posts: [
        { idx: 0, pos: 0 },
        { idx: 1, pos: 1 },
      ],
      readyBuffer: 1,
      isCurrent: () => true,
      runResearch: async (post) => (post.pos === 0 ? null : "ok"),
      runContent: async (job) => {
        contentStarts.push(job.pos);
      },
    });
    expect(contentStarts).toEqual([1]);
  });

  it("stops scheduling when isCurrent becomes false", async () => {
    let current = true;
    const contentStarts: number[] = [];
    const researchStarts: number[] = [];

    const run = runAutoSeoResearchContentPipeline({
      posts: Array.from({ length: 5 }, (_, i) => ({ idx: i, pos: i })),
      readyBuffer: 2,
      researchConcurrency: 2,
      contentConcurrency: 2,
      isCurrent: () => current,
      runResearch: async (post) => {
        researchStarts.push(post.pos);
        await delay(20);
        if (post.pos >= 1) current = false;
        return `d-${post.pos}`;
      },
      runContent: async (job) => {
        contentStarts.push(job.pos);
      },
    });

    await run;
    expect(contentStarts.length).toBeLessThan(5);
  });

  it("overlaps research ahead of content after warm start", async () => {
    const events: string[] = [];
    await runAutoSeoResearchContentPipeline({
      posts: Array.from({ length: 5 }, (_, i) => ({ idx: i, pos: i })),
      readyBuffer: 2,
      researchConcurrency: 3,
      contentConcurrency: 3,
      isCurrent: () => true,
      runResearch: async (post) => {
        events.push(`R${post.pos}`);
        await delay(25);
        return `d-${post.pos}`;
      },
      runContent: async (job) => {
        events.push(`C${job.pos}`);
        await delay(25);
      },
    });

    const firstContentIdx = events.findIndex((e) => e.startsWith("C"));
    expect(firstContentIdx).toBeGreaterThan(0);
    const afterFirstContent = events.slice(firstContentIdx);
    expect(afterFirstContent.some((e) => e.startsWith("R"))).toBe(true);
  });
});
