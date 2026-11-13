import { Users } from "lucide-react";
import { DASHBOARD_SETTINGS_PANEL_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { TeamAgenciesPanel } from "@/components/manager/teams/TeamAgenciesPanel";
import { TeamWorkspacePanel } from "@/components/manager/teams/TeamWorkspacePanel";
import { TeamSeatManagerPanel } from "@/components/manager/teams/TeamSeatManagerPanel";
import { TeamInvitePanel } from "@/components/manager/teams/TeamInvitePanel";
import { TeamPendingInvitesPanel } from "@/components/manager/teams/TeamPendingInvitesPanel";
import { TeamMailTestPanel } from "@/components/manager/teams/TeamMailTestPanel";
import { CareerSubmissionsAdminPanel } from "@/components/careers/CareerSubmissionsAdminPanel";
import { useTeam } from "@/contexts/TeamContext";

export function TeamsSettingsContent() {
  const { activeTeam, teams } = useTeam();

  return (
    <div className={`${DASHBOARD_SETTINGS_PANEL_CLASS} space-y-4 text-white`}>
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-white" aria-hidden />
        <h2 className="text-base font-semibold text-white">Users</h2>
      </div>

      <TeamAgenciesPanel />
      <TeamWorkspacePanel />
      {teams.length > 0 && activeTeam ? (
        <>
          <TeamSeatManagerPanel />
          <TeamInvitePanel />
          <TeamMailTestPanel />
          <TeamPendingInvitesPanel />
        </>
      ) : null}
      <CareerSubmissionsAdminPanel />
    </div>
  );
}
