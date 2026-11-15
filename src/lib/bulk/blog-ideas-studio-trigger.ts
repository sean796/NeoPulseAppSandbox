export type BlogIdeasStudioRunRequest = {
  siteId: string;
  postCount: number;
};

export type BlogIdeasStudioRunResult = {
  created: number;
  failed: number;
  urls: string[];
};

type BlogIdeasStudioHandler = (request: BlogIdeasStudioRunRequest) => Promise<BlogIdeasStudioRunResult>;

export const BLOG_IDEAS_STUDIO_SELECTING_SITE = "Selecting site for Blog Ideas Studio.";

let studioHandler: BlogIdeasStudioHandler | null = null;
let pendingStudioRun: BlogIdeasStudioRunRequest | null = null;

export function takePendingBlogIdeasStudioRun(siteId: string): BlogIdeasStudioRunRequest | null {
  if (!pendingStudioRun || pendingStudioRun.siteId !== siteId) return null;
  const next = pendingStudioRun;
  pendingStudioRun = null;
  return next;
}

export function peekPendingBlogIdeasStudioRun(): BlogIdeasStudioRunRequest | null {
  return pendingStudioRun;
}

export function queueBlogIdeasStudioRun(request: BlogIdeasStudioRunRequest): void {
  pendingStudioRun = {
    siteId: String(request.siteId ?? "").trim(),
    postCount: Math.max(1, Math.floor(Number(request.postCount) || 0)),
  };
}

export function isBlogIdeasStudioOpen(): boolean {
  return studioHandler != null;
}

/** Blog Ideas Studio registers the Ideas button, then the post run. */
export function registerBlogIdeasStudio(handler: BlogIdeasStudioHandler): () => void {
  studioHandler = handler;
  return () => {
    if (studioHandler === handler) studioHandler = null;
  };
}

/**
 * Queue one idea per gap, then run the open Blog Ideas Studio (Ideas, then auto-approve).
 * If the studio is not mounted yet, keeps the queue for the studio mount effect.
 */
export async function runBlogIdeasStudio(
  request: BlogIdeasStudioRunRequest,
): Promise<BlogIdeasStudioRunResult> {
  queueBlogIdeasStudioRun(request);
  if (!studioHandler) {
    return { created: 0, failed: 0, urls: [] };
  }
  return studioHandler(pendingStudioRun ?? request);
}

/** Wait until Blog Ideas Studio is open on the target site, then run Ideas + auto-approve for the gap. */
export async function runBlogIdeasStudioWhenReady(
  request: BlogIdeasStudioRunRequest,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<BlogIdeasStudioRunResult> {
  queueBlogIdeasStudioRun(request);
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const pollMs = opts?.pollMs ?? 400;
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (!studioHandler) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    try {
      const result = await studioHandler(pendingStudioRun ?? request);
      if (result.created >= request.postCount) return result;
      throw new Error(
        `Blog Ideas Studio created ${result.created}/${request.postCount} posts.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes(BLOG_IDEAS_STUDIO_SELECTING_SITE)) {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Open Blog Ideas Studio.");
}
