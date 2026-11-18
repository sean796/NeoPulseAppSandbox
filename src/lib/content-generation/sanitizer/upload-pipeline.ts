import { stripPlaceholderDomainLinks } from "@/lib/placeholder-link-domains";
import { repairHarnessLinkLeaks } from "@/lib/content-generation/harness-link-leak-repair";
import { sanitizePlaceholders } from "@/lib/content-generation/sanitizer/placeholder-rules";
import { removeFeatureLabelArtifacts } from "@/lib/content-generation/sanitizer/feature-label-rules";
import { removeArticleTitleLabels } from "@/lib/content-generation/sanitizer/structure-rules";
import { removeForbiddenSections, removeDuplicateHeadings } from "@/lib/content-generation/sanitizer/structure-rules";
import { removeEmptyTables, removeLinkColumnsFromTables } from "@/lib/content-generation/sanitizer/table-rules";
import {
  fixMalformedLinks,
  fixOrphanedListItems,
  flattenListItemBlockWrappers,
  removeInvalidInternalLinks,
  removeNonWikipediaExternalLinks,
  ensureNoLinkEndsInPeriod,
  stripDanglingForMoreTail,
  stampExternalLinksNofollow,
} from "@/lib/content-generation/sanitizer/link-rules";
import { forceConvertMarkdownLinks } from "@/lib/content-generation/sanitizer/markdown-rules";
import { enforceOneImagePerSection } from "@/lib/content-generation/sanitizer/structure-rules";

/**
 * Full content sanitization pipeline
 * Applies all sanitization rules before WordPress upload
 */
export function sanitizeContentForUpload(
  content: string,
  connectedSiteUrl?: string,
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  allowedWikipediaUrl?: string,
  allowedExternalUrls?: string[],
  wikipediaEntityLabel?: string
): string {
    if (!content) return content;
  let sanitized = content;

  // Step 0: Strip example.com / reserved placeholder hrefs (defense in depth; preserves Wikipedia)
  sanitized = stripPlaceholderDomainLinks(sanitized);
  
  // Step 1: Remove placeholder artifacts
  sanitized = sanitizePlaceholders(sanitized);
  
  // Step 1.05: Remove feature-label artifacts ([LIST]: ..., [TABLE]: ..., etc.)
  sanitized = removeFeatureLabelArtifacts(sanitized);
  
  // Step 1.1: Remove "Article Title" labels (must be first to catch metadata)
  sanitized = removeArticleTitleLabels(sanitized);
  
  // Step 1.15: Remove forbidden sections (like "External Resources") - must be before duplicate heading removal
  sanitized = removeForbiddenSections(sanitized);
  
  // Step 1.2: Remove duplicate consecutive headings (must be early in pipeline)
  sanitized = removeDuplicateHeadings(sanitized);
  
  // Step 1.3: Remove empty tables (must be before fixing malformed tables)
  sanitized = removeEmptyTables(sanitized);
  // Step 1.45: Remove link columns from tables (links must be integrated into content columns)
  sanitized = removeLinkColumnsFromTables(sanitized);
  
  // Step 1.46: Fix malformed link formats (like [URL: ...] to proper markdown)
  sanitized = fixMalformedLinks(sanitized);
  
  // Step 1.48: Fix orphaned <li> elements (bare <li> without <ul>/<ol> wrapper, stray closers)
  sanitized = fixOrphanedListItems(sanitized);
  sanitized = flattenListItemBlockWrappers(sanitized);

  // Bulk: no colon/em-dash transforms - preserve HTML exactly
  // Step 2: Remove invalid internal links (CRITICAL - only allow links from WordPress posts)
  // Same-site media asset URLs (uploads / image / video) are kept via isMediaAssetUrl.
  const beforeInternalLen = sanitized.length;
  sanitized = removeInvalidInternalLinks(sanitized, wordPressPosts, connectedSiteUrl);
  const afterInternalLen = sanitized.length;
  
  // Step 5: Remove external links (only connected site + entity Wikipedia + pre-validated DFS external links + preserved media)
  const beforeExternalLen = sanitized.length;
  sanitized = removeNonWikipediaExternalLinks(sanitized, connectedSiteUrl, allowedWikipediaUrl, allowedExternalUrls);
  const afterExternalLen = sanitized.length;

  // Step 6: Enforce one image per section
  sanitized = enforceOneImagePerSection(sanitized);
  
  // Step 7: Final cleanup
  sanitized = sanitized.trim();
  
  // Step 8: Final link pass - ensure ZERO markdown links survive (entity/Wikipedia etc.)
  sanitized = repairHarnessLinkLeaks(sanitized);
  sanitized = forceConvertMarkdownLinks(sanitized);

  // Step 9: After external link allowlist — normalize sentence-ending link punctuation
  sanitized = ensureNoLinkEndsInPeriod(sanitized);

  // Step 10: Remove orphan " for more." tails (never reintroduce SEO stubs)
  sanitized = stripDanglingForMoreTail(sanitized);

  // Step 11: Every remaining external link is nofollow (after link repair)
  sanitized = stampExternalLinksNofollow(sanitized, connectedSiteUrl);
  
  return sanitized;
}
