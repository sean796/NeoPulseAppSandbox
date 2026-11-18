import { setSessionToken } from "../src/lib/auth-device.ts";
import { setPostCreatorWorkerApiBase } from "../src/lib/wordpress-api/connection.ts";
import { setServerHarnessSitesOverride } from "../src/components/integrations/storage.ts";
import { ensureEntitySiteWarmCache } from "../src/lib/local-analysis/entity-site-warm-cache.ts";
import { loadBulkSitemapInventoryForSite } from "../src/lib/bulk/bulk-sitemap-inventory-session.ts";

const site = JSON.parse(process.env.SITE_JSON!);
setSessionToken(process.env.TOKEN!);
setPostCreatorWorkerApiBase("http://127.0.0.1:8080");
process.env.VITE_BACKEND_API_BASE = "http://127.0.0.1:8080";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
setServerHarnessSitesOverride([site]);

const inv = await loadBulkSitemapInventoryForSite(site);
console.log("inventory", inv.totalRows, inv.error || "", Object.keys(inv.buckets || {}));
const bundle = await ensureEntitySiteWarmCache(site, { requireGsc: true });
console.log("bundle counts", bundle.counts, "error", bundle.error || "");
