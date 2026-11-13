import type { Dispatch, SetStateAction } from "react";
import { Download, Plus, RotateCcw, Upload } from "lucide-react";
import { OPTIMIZATION_TILE_COUNTS_ENABLED } from "@/lib/wordpress-optimization-tile-counts";
import { Button, Field, SelectField } from "@/ui";

export type PropertiesWorkspaceToolbarProps = {
  siteSearchQuery: string;
  onSearchChange: (query: string) => void;
  editorialPackageFilter: "all" | "standard" | "lite" | "unassigned";
  setEditorialPackageFilter: Dispatch<SetStateAction<"all" | "standard" | "lite" | "unassigned">>;
  editorialMonthOptions?: Array<{ key: string; label: string }>;
  editorialSelectedMonthKey?: string;
  setEditorialSelectedMonthKey: Dispatch<SetStateAction<string>>;
  credentialedSiteCount: number;
  isRefreshingAllQuarterCounts: boolean;
  isRefreshingAllOptimizationCounts: boolean;
  refreshAllQuarterCounts: () => Promise<unknown>;
  refreshAllOptimizationCounts: () => Promise<unknown>;
  sitesCount: number;
  onExportAllSitesCsv: () => void;
  onBulkImport: () => void;
  onAddSite: () => void;
};

/** Dock head controls for the Properties Studio left pane. */
export function PropertiesWorkspaceToolbar({
  siteSearchQuery,
  onSearchChange,
  editorialPackageFilter,
  setEditorialPackageFilter,
  editorialMonthOptions = [],
  editorialSelectedMonthKey = "",
  setEditorialSelectedMonthKey,
  credentialedSiteCount,
  isRefreshingAllQuarterCounts: _isRefreshingAllQuarterCounts,
  isRefreshingAllOptimizationCounts: _isRefreshingAllOptimizationCounts,
  refreshAllQuarterCounts,
  refreshAllOptimizationCounts,
  sitesCount,
  onExportAllSitesCsv,
  onBulkImport,
  onAddSite,
}: PropertiesWorkspaceToolbarProps) {
  const monthOptions = editorialMonthOptions ?? [];

  return (
    <div className="neo-pulse-properties-dock-head flex w-full min-w-0 shrink-0 flex-col gap-2 bg-zinc-950 py-2">
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <Field
            placeholder="Search sites"
            value={siteSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search sites by name"
          />
        </div>
        <SelectField
          tone="data"
          placeholder="All tiers"
          value={editorialPackageFilter}
          onValueChange={(v) =>
            setEditorialPackageFilter(v as "all" | "standard" | "lite" | "unassigned")
          }
          options={[
            { value: "all", label: "All tiers" },
            { value: "standard", label: "Standard" },
            { value: "lite", label: "Lite" },
            { value: "unassigned", label: "Unassigned" },
          ]}
        />
        {monthOptions.length > 0 && editorialSelectedMonthKey ? (
          <SelectField
            tone="data"
            placeholder="Month"
            value={editorialSelectedMonthKey}
            onValueChange={setEditorialSelectedMonthKey}
            options={monthOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
          />
        ) : null}
        <Button
          variant="tool"
          size="icon"
          icon={RotateCcw}
          type="button"
          disabled={credentialedSiteCount === 0}
          onClick={() =>
            void (OPTIMIZATION_TILE_COUNTS_ENABLED
              ? Promise.all([refreshAllQuarterCounts(), refreshAllOptimizationCounts()])
              : refreshAllQuarterCounts())
          }
          title={
            OPTIMIZATION_TILE_COUNTS_ENABLED
              ? "Refresh editorial and optimization counts for all properties"
              : "Refresh editorial counts for all properties"
          }
          aria-label={
            OPTIMIZATION_TILE_COUNTS_ENABLED
              ? "Refresh editorial and optimization counts for all properties"
              : "Refresh editorial counts for all properties"
          }
        />
      </div>
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onAddSite}
            title="Add Site"
            aria-label="Add Site"
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-none border border-white/10 bg-white/5 px-3 text-base font-medium text-white shadow-none transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Add Site</span>
          </button>
        </div>
        <Button
          variant="tool"
          size="icon"
          icon={Upload}
          type="button"
          onClick={onBulkImport}
          title="Bulk import properties from CSV"
          aria-label="Import properties"
        />
        <Button
          variant="tool"
          size="icon"
          icon={Download}
          type="button"
          onClick={onExportAllSitesCsv}
          disabled={sitesCount === 0}
          title="Download all properties as a CSV spreadsheet (includes credentials - store securely)"
          aria-label="Export all properties"
        />
      </div>
    </div>
  );
}
