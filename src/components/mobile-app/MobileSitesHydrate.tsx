import { useEffect } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { hydrateLocalAppStateFromServerIfEmpty } from "@/components/integrations/storage";

/** Always pull the Properties roster from the server mirror into memory. */
export function MobileSitesHydrate(): null {
  const { reloadSitesFromStorage } = useWordPressSites();

  useEffect(() => {
    let cancelled = false;
    void hydrateLocalAppStateFromServerIfEmpty().then(() => {
      if (!cancelled) reloadSitesFromStorage();
    });
    return () => {
      cancelled = true;
    };
  }, [reloadSitesFromStorage]);

  return null;
}
