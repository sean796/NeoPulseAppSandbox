import { NeoPulseAppBrand } from "@/components/manager/NeoPulseAppBrand";
import {
  type ManagerSettingsClusterId,
  writeStoredManagerSettingsCluster,
} from "@/components/manager/manager-settings-cluster";
import { Button } from "@/ui";

/** In-app shortcuts; inner wrapper adds horizontal gutter so the footer never sits flush to the column edge. */
const FOOTER_APP_LINKS: { value: string; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "changelog", label: "Changelog" },
  { value: "api", label: "API" },
];

export interface ManagerAppFooterProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  /** Footer brand → Dashboard home (Properties). Syncs mega menu cluster when provided. */
  onDashboardBrandClick?: () => void;
  /** Optional: set Dashboard settings dock item (Changelog footer link). */
  onDashboardClusterChange?: (id: ManagerSettingsClusterId) => void;
  /** Active Dashboard cluster; used so Changelog footer press state matches Settings dock. */
  settingsCluster?: ManagerSettingsClusterId;
}

export function ManagerAppFooter({
  currentTab,
  onTabChange,
  onDashboardBrandClick,
  onDashboardClusterChange,
  settingsCluster,
}: ManagerAppFooterProps) {
  const year = new Date().getFullYear();

  const handleBrandClick = () => {
    if (onDashboardBrandClick) {
      onDashboardBrandClick();
    } else {
      writeStoredManagerSettingsCluster("properties");
      onTabChange("dashboard");
    }
  };

  const handleFooterLink = (value: string) => {
    if (value === "changelog") {
      writeStoredManagerSettingsCluster("changelog");
      onDashboardClusterChange?.("changelog");
      onTabChange("changelog");
      return;
    }
    if (value === "dashboard") {
      writeStoredManagerSettingsCluster("properties");
      onDashboardClusterChange?.("properties");
    }
    onTabChange(value);
  };

  return (
    <footer
      data-neo-pulse-manager-footer
      className="relative z-[1] mt-0 w-full shrink-0 overflow-hidden bg-black"
      role="contentinfo"
    >
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-4 px-5 py-2.5 md:px-6 md:py-3">
        <div className="flex shrink-0 items-center">
          <NeoPulseAppBrand variant="default" onClick={handleBrandClick} />
        </div>

        <nav
          className="flex min-w-0 flex-1 shrink-0 flex-nowrap items-center gap-1 overflow-x-auto"
          aria-label="Primary workspace areas"
        >
          {FOOTER_APP_LINKS.map(({ value, label }) => {
            const active =
              value === "changelog"
                ? settingsCluster === "changelog"
                : value === "dashboard"
                  ? currentTab === "dashboard" && settingsCluster !== "changelog"
                  : currentTab === value;
            return (
              <Button
                pressed={Boolean(active)}
                variant="quiet"
                key={value}
                onClick={() => handleFooterLink(value)}
              >
                {label}
              </Button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-4 text-base text-muted-foreground">
          <span className="hidden whitespace-nowrap sm:inline">© {year} NEO Pulse</span>
        </div>
      </div>
    </footer>
  );
}
