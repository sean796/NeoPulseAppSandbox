import { Users } from "lucide-react";

import { OrganicMetricDelta } from "@/components/organic-dashboard/OrganicMetricDelta";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import type { OrganicNdusLeadsTableRow } from "@/lib/organic-dashboard/organic-dashboard-ndus-leads";
import type { OrganicDashboardPeriodLabels } from "@/lib/organic-dashboard/organic-dashboard-view-model";

export type OrganicSeoLeadsSectionProps = {
  tableRows: OrganicNdusLeadsTableRow[];
  periodLabels: OrganicDashboardPeriodLabels;
  showCompare: boolean;
  loadError: string | null;
};

export function OrganicSeoLeadsSection({
  tableRows,
  periodLabels,
  showCompare,
  loadError,
}: OrganicSeoLeadsSectionProps) {
  return (
    <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
      <div className="flex items-center gap-2">
        <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
          <Users className="h-4 w-4" aria-hidden />
        </span>
        <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>Organic Website Leads</h2>
      </div>

      {loadError ? <p className="text-base text-ui-danger-hover">{loadError}</p> : null}

      {tableRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-base">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-normal">Metric</th>
                {showCompare ? (
                  <>
                    <th className="pb-2 pr-4 font-normal tabular-nums">{periodLabels.compare}</th>
                    <th className="pb-2 pr-4 font-normal tabular-nums">Change</th>
                    <th className="pb-2 font-normal tabular-nums">{periodLabels.primary}</th>
                  </>
                ) : (
                  <th className="pb-2 font-normal tabular-nums">{periodLabels.primary}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">{row.label}</td>
                  {showCompare ? (
                    <>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{row.previous}</td>
                      <td className="py-2 pr-4">
                        <OrganicMetricDelta delta={row.delta} />
                      </td>
                      <td className="py-2 tabular-nums text-white">{row.current}</td>
                    </>
                  ) : (
                    <td className="py-2 tabular-nums text-white">{row.current}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
