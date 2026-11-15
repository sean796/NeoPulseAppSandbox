import React, { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { OverviewDocRevisionsSection } from "@/components/pulse-assist/OverviewDocRevisionsSection";
import { OverviewDocSerpMetaCard } from "@/components/overview/studio/OverviewDocSerpMetaCard";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import {
  getStudioDocMetaInspectorBridge,
  subscribeStudioDocMetaInspectorBridge,
} from "@/lib/overview/studio-doc-meta-bridge";
import { getWordPressPostContent } from "@/lib/wordpress-api/posts";
import type { WordPressPostContent } from "@/lib/wordpress-api/types";
import { cn } from "@/lib/utils";
import { Button, TextareaField } from "@/ui";

function leadVisualFromHtml(html: string | undefined): string | null {
  const raw = html ?? "";
  const poster = raw.match(/<video\b[^>]*\bposter=["']([^"']+)["']/i)?.[1]?.trim();
  if (poster?.startsWith("http")) return poster;
  const img = raw.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]?.trim();
  if (img?.startsWith("http")) return img;
  return null;
}

function htmlFromPost(post: WordPressPostContent | undefined): string {
  const content = post?.fullData?.content;
  if (content && typeof content === "object") {
    const rendered = content as { rendered?: string; raw?: string };
    return String(rendered.rendered || rendered.raw || "");
  }
  return post?.content || "";
}

function readFeaturedImageUrl(post: WordPressPostContent | undefined): string | null {
  const direct = post?.featuredImageUrl?.trim();
  if (direct?.startsWith("http")) return direct;
  const full = post?.fullData;
  if (!full) return null;
  const embedded = full._embedded?.["wp:featuredmedia"];
  if (Array.isArray(embedded)) {
    const source = String((embedded[0] as { source_url?: string } | undefined)?.source_url ?? "").trim();
    if (source.startsWith("http")) return source;
  }
  const yoast = full.yoast_head_json as { og_image?: Array<{ url?: string }> } | undefined;
  const yoastUrl = yoast?.og_image?.[0]?.url?.trim();
  if (yoastUrl?.startsWith("http")) return yoastUrl;
  const jetpack = String(full.jetpack_featured_media_url ?? "").trim();
  if (jetpack.startsWith("http")) return jetpack;
  return leadVisualFromHtml(htmlFromPost(post));
}

function postSubtype(postType: string | null | undefined): string {
  const type = (postType ?? "").toLowerCase();
  if (type === "post" || type === "posts") return "post";
  if (type === "page" || type === "pages") return "page";
  return type || "page";
}

function triggerDownloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PulseEngineInspectorPanel() {
  const { overview, activeSite } = usePulseAssistContext();
  const [briefOpen, setBriefOpen] = useState<boolean>(true);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);

  const docMetaBridge = useSyncExternalStore(
    subscribeStudioDocMetaInspectorBridge,
    getStudioDocMetaInspectorBridge,
    getStudioDocMetaInspectorBridge,
  );

  const seoResearchVal = docMetaBridge?.row.seoResearch ?? "";
  const rowPostId = docMetaBridge?.row.postId ?? null;
  const rowUrl = docMetaBridge?.row.url ?? "";
  const rowPostType = docMetaBridge?.row.postType ?? "";

  useEffect(() => {
    if (!activeSite?.siteUrl || !activeSite.username || !activeSite.appPassword || !rowUrl) {
      setFeaturedImageUrl(null);
      return;
    }
    let cancelled = false;
    const slug = rowUrl.split("/").filter(Boolean).pop() ?? "";
    const request = rowPostId
      ? getWordPressPostContent(
          activeSite.siteUrl,
          activeSite.username,
          activeSite.appPassword,
          undefined,
          undefined,
          [{ id: rowPostId, subtype: postSubtype(rowPostType) }],
        )
      : getWordPressPostContent(
          activeSite.siteUrl,
          activeSite.username,
          activeSite.appPassword,
          undefined,
          slug ? [slug] : undefined,
        );
    void request
      .then((result) => {
        if (!cancelled) setFeaturedImageUrl(readFeaturedImageUrl(result.posts?.[0]));
      })
      .catch(() => {
        if (!cancelled) setFeaturedImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rowPostId, rowUrl, rowPostType, activeSite?.siteUrl, activeSite?.username, activeSite?.appPassword]);

  if (!docMetaBridge) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center bg-black px-5 py-8 text-center text-base text-muted-foreground">
        Select an article or page in the Content Optimizer to inspect and edit its SEO Title, Meta Description, Focus Keyword, URL Slug, and Research Brief.
      </div>
    );
  }

  const shownImage =
    featuredImageUrl ||
    leadVisualFromHtml(docMetaBridge.row.postContentOptimized) ||
    leadVisualFromHtml(docMetaBridge.row.postContent);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-black px-5 py-5 text-base text-white">
      {shownImage ? (
        <div className="aspect-video w-full overflow-hidden bg-zinc-900">
          <img
            src={shownImage}
            alt={docMetaBridge.row.title || "Featured image"}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      {/* 1. WordPress-Style Document SEO & Meta Inspector */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white">Page SEO & Meta</span>
          <span className="bg-ui-field px-2 py-0.5 text-base text-semantic-analysis-foreground">
            {overview.sitemapSource?.toUpperCase() || "DOC"}
          </span>
        </div>
        <OverviewDocSerpMetaCard
          row={docMetaBridge.row}
          rowIndex={docMetaBridge.rowIndex}
          busy={docMetaBridge.busy}
          onUpdateRow={docMetaBridge.onUpdateRow}
          onAiKeyword={docMetaBridge.onAiKeyword}
          onAiUrl={docMetaBridge.onAiUrl}
          onAiTitle={docMetaBridge.onAiTitle}
          onAiMeta={docMetaBridge.onAiMeta}
          onAiAllMeta={docMetaBridge.onAiAllMeta}
          onResearchRow={docMetaBridge.onResearchRow}
          onSetDateToday={docMetaBridge.onSetDateToday}
          onCommitDateModifier={docMetaBridge.onCommitDateModifier}
        />
      </div>

      {/* 2. SEO Research Brief Inspector (Editable + Downloadable) */}
      <div className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="quiet"
            onClick={() => setBriefOpen((prev) => !prev)}
          >
            <FileText className="h-4 w-4 shrink-0 text-semantic-analysis-foreground" aria-hidden />
            <span>SEO Research Brief</span>
            <span className="ml-auto tabular-nums text-semantic-analysis-foreground">
              {seoResearchVal.length.toLocaleString()} chars
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", briefOpen && "rotate-180")}
              aria-hidden
            />
          </Button>
          {seoResearchVal.trim() ? (
            <Button
              variant="quiet"
              type="button"
              onClick={() =>
                triggerDownloadText(
                  `seo-research-brief-${docMetaBridge.row.postId || "row"}.json`,
                  seoResearchVal,
                  "application/json;charset=utf-8",
                )
              }
              title="Download SEO Research Brief JSON"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>

        {briefOpen ? (
          <TextareaField
            value={seoResearchVal}
            onChange={(e) =>
              docMetaBridge.onUpdateRow(docMetaBridge.rowIndex, {
                seoResearch: e.target.value,
              })
            }
            rows={10}
            placeholder="No research brief on this row yet. Click Research above to pull DataForSEO + GSC + Semrush data."
            aria-label="SEO Research Brief"
          />
        ) : null}
      </div>

      <OverviewDocRevisionsSection pageUrl={docMetaBridge.row.url} />
    </div>
  );
}
