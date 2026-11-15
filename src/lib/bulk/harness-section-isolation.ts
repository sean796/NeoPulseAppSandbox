import { isFaqStyleHeadingTitle } from "@/lib/content-generation/faq-heading-policy";
import { logger } from "@/lib/logger";

export type HarnessSectionIsolatedResult = {
  html: string;
  dropped: boolean;
};

/** FAQ-style H2s are appended later as flo-faq; do not retry them. */
export function isSkippableFaqHarnessSection(title: string): boolean {
  return isFaqStyleHeadingTitle(title);
}

/**
 * Run one harness section without aborting the row.
 * FAQ-style sections: on throw, drop (no retry).
 * All other sections: retry once, then drop.
 * Never invents substitute HTML.
 */
export async function runHarnessSectionIsolated(args: {
  title: string;
  run: () => Promise<string>;
  onProgress?: (message: string) => void;
}): Promise<HarnessSectionIsolatedResult> {
  const title = args.title.trim() || "section";
  const skipRetry = isSkippableFaqHarnessSection(title);

  try {
    const html = (await args.run()).trim();
    return { html, dropped: false };
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (skipRetry) {
      logger.warn(`[Bulk Harness] Skipping FAQ section "${title}" after failure: ${firstMsg}`);
      args.onProgress?.(`Skipping FAQ section "${title}"; posting the rest.`);
      return { html: "", dropped: true };
    }

    logger.warn(`[Bulk Harness] Section "${title}" failed; retrying once: ${firstMsg}`);
    args.onProgress?.(`Retrying section "${title}" once…`);
    try {
      const html = (await args.run()).trim();
      return { html, dropped: false };
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      logger.warn(`[Bulk Harness] Section "${title}" failed after retry; dropping: ${retryMsg}`);
      args.onProgress?.(`Dropped section "${title}" after one retry; posting the rest.`);
      return { html: "", dropped: true };
    }
  }
}
