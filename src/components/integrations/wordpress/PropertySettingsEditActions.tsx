import React, { useCallback, useState } from "react";
import { Copy, Power, Trash2, Wand2 } from "lucide-react";
import { Button, FilterRow } from "@/ui";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { loadApiKey } from "@/lib/api";
import { applyGbpPropertyWand } from "@/lib/wordpress-site-display-name-from-dfs-gmb";
import type { WordPressSite } from "../types";

export type PropertySettingsEditActionsProps = {
  site: WordPressSite;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  onToggleEnabled?: () => void;
  onDelete?: () => void;
};

/** Profile Settings edit actions (replaces the dock row … menu). */
export function PropertySettingsEditActions({
  site,
  onPatchSite,
  onToggleEnabled,
  onDelete,
}: PropertySettingsEditActionsProps) {
  const [isResolvingGmbName, setIsResolvingGmbName] = useState(false);
  const isEnabled = site.enabled !== false;
  const siteUrl = site.siteUrl?.trim() ?? "";

  const resolveGmbName = useCallback(async () => {
    if (!onPatchSite || isResolvingGmbName) return;
    setIsResolvingGmbName(true);
    try {
      const r = await applyGbpPropertyWand(site, {
        openRouterApiKey: loadApiKey()?.trim() || undefined,
      });
      if (r.ok === false) {
        notify.error(r.error);
        return;
      }
      const next = r.name.trim();
      if (next && next !== site.name.trim()) {
        onPatchSite(site.id, { name: next });
      }
    } catch (err) {
      notifyHeaderError("GBP name resolve failed", err);
    } finally {
      setIsResolvingGmbName(false);
    }
  }, [isResolvingGmbName, onPatchSite, site]);

  return (
    <FilterRow aria-label="Property edit actions">
      <Button
        variant="quiet"
        type="button"
        disabled={!siteUrl}
        onClick={() => void navigator.clipboard.writeText(siteUrl)}
        title="Copy site URL"
        aria-label="Copy site URL"
      >
        <Copy className="h-4 w-4 shrink-0" aria-hidden />
        Copy URL
      </Button>
      {onPatchSite ? (
        <Button
          variant="quiet"
          type="button"
          disabled={isResolvingGmbName}
          onClick={() => void resolveGmbName()}
          title="Set property name from Google Business Profile"
          aria-label="Set property name from Google Business Profile"
          aria-busy={isResolvingGmbName}
        >
          <Wand2 className="h-4 w-4 shrink-0" aria-hidden />
          {isResolvingGmbName ? "Resolving" : "GBP name"}
        </Button>
      ) : null}
      {onToggleEnabled ? (
        <Button
          variant="quiet"
          type="button"
          onClick={onToggleEnabled}
          title={isEnabled ? "Disable property" : "Enable property"}
          aria-label={isEnabled ? "Disable property" : "Enable property"}
        >
          <Power className="h-4 w-4 shrink-0" aria-hidden />
          {isEnabled ? "Disable" : "Enable"}
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          variant="danger"
          type="button"
          onClick={onDelete}
          title="Delete property"
          aria-label="Delete property"
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
          Delete
        </Button>
      ) : null}
    </FilterRow>
  );
}
