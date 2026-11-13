import pLimit from "p-limit";

/** Research lane: warm the next batch of three. */
export const AUTO_SEO_RESEARCH_CONCURRENCY = 3;
/** Content lane: optimize/publish three at a time. */
export const AUTO_SEO_CONTENT_CONCURRENCY = 3;
/** Prefer this many research-done posts buffered before content opens. */
export const AUTO_SEO_RESEARCH_READY_BUFFER = 2;

export type AutoSeoPipelinePost = {
  idx: number;
  pos: number;
};

export type AutoSeoReadyJob<TDigest> = AutoSeoPipelinePost & {
  digest: TDigest;
};

export type RunAutoSeoResearchContentPipelineArgs<TDigest> = {
  posts: readonly AutoSeoPipelinePost[];
  researchConcurrency?: number;
  contentConcurrency?: number;
  readyBuffer?: number;
  isCurrent: () => boolean;
  /** Return digest when research+read succeeded; null to skip content for this post. */
  runResearch: (post: AutoSeoPipelinePost) => Promise<TDigest | null>;
  runContent: (job: AutoSeoReadyJob<TDigest>) => Promise<void>;
};

/**
 * Research producer (x3) fills a ready buffer (prefer 2), then content consumer (x3)
 * drains ready jobs. Research keeps warming the next trio so content is not starved.
 */
export async function runAutoSeoResearchContentPipeline<TDigest>(
  args: RunAutoSeoResearchContentPipelineArgs<TDigest>,
): Promise<void> {
  const posts = args.posts;
  if (posts.length === 0) return;

  const researchConcurrency = args.researchConcurrency ?? AUTO_SEO_RESEARCH_CONCURRENCY;
  const contentConcurrency = args.contentConcurrency ?? AUTO_SEO_CONTENT_CONCURRENCY;
  const readyBuffer = args.readyBuffer ?? AUTO_SEO_RESEARCH_READY_BUFFER;
  const warmTarget = Math.min(Math.max(1, readyBuffer), posts.length);

  const contentLimit = pLimit(contentConcurrency);
  const contentTasks: Promise<void>[] = [];
  const warmHold: AutoSeoReadyJob<TDigest>[] = [];
  let warmed = false;

  const scheduleContent = (job: AutoSeoReadyJob<TDigest>) => {
    contentTasks.push(
      contentLimit(async () => {
        if (!args.isCurrent()) return;
        await args.runContent(job);
      }),
    );
  };

  const releaseWarmHold = () => {
    if (warmed) return;
    warmed = true;
    for (const job of warmHold) scheduleContent(job);
    warmHold.length = 0;
  };

  const acceptReady = (job: AutoSeoReadyJob<TDigest>) => {
    if (!args.isCurrent()) return;
    if (!warmed) {
      warmHold.push(job);
      if (warmHold.length >= warmTarget) releaseWarmHold();
      return;
    }
    scheduleContent(job);
  };

  const researchLimit = pLimit(researchConcurrency);
  await Promise.all(
    posts.map((post) =>
      researchLimit(async () => {
        if (!args.isCurrent()) return;
        const digest = await args.runResearch(post);
        if (!args.isCurrent()) return;
        if (digest == null) return;
        acceptReady({ ...post, digest });
      }),
    ),
  );

  // Fewer than warmTarget succeeded, or cancel mid-warm: flush whatever is held.
  releaseWarmHold();
  await Promise.all(contentTasks);
}
