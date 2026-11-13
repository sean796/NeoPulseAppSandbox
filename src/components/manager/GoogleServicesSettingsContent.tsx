import { GoogleAnalyticsSettingsContent } from "@/components/GoogleAnalyticsSettingsContent";
import { GSCSettingsConnectionSection } from "@/components/integrations/GSCFeature";
import { GMBSettingsContent } from "@/components/GMBSettingsContent";
import { GoogleDriveSettingsContent } from "@/components/GoogleDriveSettingsContent";
import { GoogleAdsSettingsContent } from "@/components/manager/GoogleAdsSettingsContent";
import {
  SETTINGS_STUDIO_PANEL_CLASS,
  SETTINGS_STUDIO_PANEL_TITLE_CLASS,
} from "@/components/manager/settings/settings-studio-surfaces";
import { cn } from "@/lib/utils";

const jumpLink = cn(
  "block rounded-none border-0 bg-black p-3 text-white transition-colors",
  "hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export function GoogleServicesSettingsContent() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3" aria-label="Google Services">
      <section className={SETTINGS_STUDIO_PANEL_CLASS}>
        <h2 className={SETTINGS_STUDIO_PANEL_TITLE_CLASS}>Start here</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <a href="#gsc" className={jumpLink}>
            <span className="font-semibold">Search Console</span>
            <p className="mt-1 text-white">Service account JSON. Copy the API email, then test.</p>
          </a>
          <a href="#ga4" className={jumpLink}>
            <span className="font-semibold">Analytics 4</span>
            <p className="mt-1 text-white">Upload JSON once. Set Property ID per site in Properties.</p>
          </a>
          <a href="#gbp" className={jumpLink}>
            <span className="font-semibold">Business Profile</span>
            <p className="mt-1 text-white">OAuth only. Connect here, then test connection.</p>
          </a>
          <a href="#drive" className={jumpLink}>
            <span className="font-semibold">Google Drive</span>
            <p className="mt-1 text-white">Connect Google Drive for Doc exports and share links.</p>
          </a>
          <a href="#ads" className={jumpLink}>
            <span className="font-semibold">Google Ads</span>
            <p className="mt-1 text-white">
              MCC ID, then Connect with the same Cloud OAuth client as Drive and Business Profile.
            </p>
          </a>
        </div>
      </section>

      <section id="gsc" aria-labelledby="gsc-heading" className={cn(SETTINGS_STUDIO_PANEL_CLASS, "scroll-mt-4")}>
        <GSCSettingsConnectionSection />
      </section>
      <section id="ga4" aria-labelledby="ga4-heading" className={cn(SETTINGS_STUDIO_PANEL_CLASS, "scroll-mt-4")}>
        <GoogleAnalyticsSettingsContent />
      </section>
      <section id="gbp" aria-labelledby="gbp-heading" className={cn(SETTINGS_STUDIO_PANEL_CLASS, "scroll-mt-4")}>
        <GMBSettingsContent />
      </section>
      <section id="drive" aria-labelledby="drive-heading" className={cn(SETTINGS_STUDIO_PANEL_CLASS, "scroll-mt-4")}>
        <GoogleDriveSettingsContent />
      </section>
      <section id="ads" aria-labelledby="ads-heading" className={cn(SETTINGS_STUDIO_PANEL_CLASS, "scroll-mt-4")}>
        <GoogleAdsSettingsContent />
      </section>
    </div>
  );
}
