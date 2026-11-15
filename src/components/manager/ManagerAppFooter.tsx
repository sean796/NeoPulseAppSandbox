import { NeoPulseAppBrand } from "@/components/manager/NeoPulseAppBrand";
import { writeStoredManagerSettingsCluster } from "@/components/manager/manager-settings-cluster";

export interface ManagerAppFooterProps {
  onTabChange: (tab: string) => void;
  /** Footer brand → Dashboard home (Properties). Syncs mega menu cluster when provided. */
  onDashboardBrandClick?: () => void;
}

export function ManagerAppFooter({
  onTabChange,
  onDashboardBrandClick,
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

  return (
    <footer
      data-neo-pulse-manager-footer
      className="relative z-[1] mt-0 w-full shrink-0 overflow-hidden bg-black"
      role="contentinfo"
    >
      <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-4 px-5 py-2.5 md:px-6 md:py-3">
        <div className="flex shrink-0 items-center">
          <NeoPulseAppBrand variant="default" onClick={handleBrandClick} />
        </div>

        <div className="flex shrink-0 items-center gap-4 text-base text-muted-foreground">
          <span className="hidden whitespace-nowrap sm:inline">© {year} NEO Pulse</span>
        </div>
      </div>
    </footer>
  );
}
