import { useCallback, useEffect, useMemo, useState } from "react";
import { MasterInstructionsSection } from "@/components/integrations/wordpress/MasterInstructionsSection";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredSites, loadSitesFromServerAlways } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import { NEO_PULSE_MASTER_RULES_PRESET_SITE_ID_KEY } from "@/lib/open-master-rules-settings";
import { SETTINGS_STUDIO_PANEL_CLASS } from "@/components/manager/settings/settings-studio-surfaces";

export function ManagerMasterRulesSettingsContent() {
  const { user } = useAuth();
  const [sites, setSites] = useState<WordPressSite[]>(() => getStoredSites());
  const [presetSiteId, setPresetSiteId] = useState("");

  const refreshSites = useCallback(() => {
    setSites(getStoredSites());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSitesFromServerAlways().then((loaded) => {
      if (!cancelled) setSites(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshSites();
  }, [refreshSites]);

  useEffect(() => {
    let preset = "";
    try {
      preset = sessionStorage.getItem(NEO_PULSE_MASTER_RULES_PRESET_SITE_ID_KEY) ?? "";
    } catch {
      preset = "";
    }
    if (preset) {
      try {
        sessionStorage.removeItem(NEO_PULSE_MASTER_RULES_PRESET_SITE_ID_KEY);
      } catch {
        /* ignore */
      }
      setPresetSiteId(preset);
    }
  }, []);

  const activeSite = useMemo(() => {
    if (presetSiteId) {
      const preset = sites.find((s) => s.id === presetSiteId);
      if (preset) return preset;
    }
    return sites.find((s) => s.enabled !== false) ?? sites[0] ?? null;
  }, [sites, presetSiteId]);

  return (
    <section className={SETTINGS_STUDIO_PANEL_CLASS} aria-label="Master Rules">
      {!user ? (
        <p className="text-base text-white">Sign in to load and save master rules.</p>
      ) : sites.length === 0 ? (
        <p className="text-base text-white">Add a property under Properties first.</p>
      ) : activeSite ? (
        <MasterInstructionsSection
          siteId={activeSite.id}
          siteUrl={activeSite.siteUrl}
          siteName={activeSite.name}
          disabled={activeSite.enabled === false}
        />
      ) : null}
    </section>
  );
}
