import { useState, useCallback, useEffect, type ReactNode } from "react";
import { clearAllMasterInstructionsMemory } from "@/lib/master-instructions-storage";
import { clearDeviceAuth, clearLegacyDeviceAuth, setSessionToken } from "@/lib/auth-device";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { fetchAuthMe, loginWithEmail, logoutApi } from "@/lib/teams-api";
import type { AuthUser, TeamPermissions, TeamSummary } from "@/lib/teams-types";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Wave 0: no optimistic placeholder user from saved device auth.
  // The user is set only after the server verifies the session.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTeam, setActiveTeam] = useState<TeamSummary | null>(null);
  const [permissions, setPermissions] = useState<TeamPermissions | null>(null);
  const [loading, setLoading] = useState(!AUTH_DISABLED);

  const applyMe = useCallback((data: Awaited<ReturnType<typeof fetchAuthMe>>) => {
    if (data.user) {
      setUser(data.user);
    } else if (data.username) {
      setUser({ id: 0, email: data.username, displayName: data.username });
    } else {
      setUser(null);
    }
    setActiveTeam(data.activeTeam ?? null);
    setPermissions(data.permissions ?? data.activeTeam?.permissions ?? null);
  }, []);

  const checkAuth = useCallback(async () => {
    if (AUTH_DISABLED) {
      setLoading(false);
      return;
    }
    clearLegacyDeviceAuth();
    try {
      const data = await fetchAuthMe();
      if (data.user || data.username) {
        applyMe(data);
      } else {
        setUser(null);
        setActiveTeam(null);
        setPermissions(null);
      }
    } catch {
      setUser(null);
      setActiveTeam(null);
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = useCallback(
    async (email: string) => {
      const result = await loginWithEmail(email);
      if (result.ok && result.sessionToken) {
        setSessionToken(result.sessionToken);
        await checkAuth();
      }
      return result;
    },
    [checkAuth],
  );

  const logout = useCallback(async () => {
    clearDeviceAuth();
    await logoutApi();
    setUser(null);
    setActiveTeam(null);
    setPermissions(null);
    clearAllMasterInstructionsMemory();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeTeam,
        permissions,
        login,
        logout,
        checkAuth,
        setActiveTeam,
        setPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
