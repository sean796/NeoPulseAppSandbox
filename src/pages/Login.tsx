import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { clearLegacyDeviceAuth } from "@/lib/auth-device";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { fetchAuthUsers, type AuthPickerUser } from "@/lib/teams-api";
import { LogIn } from "lucide-react";
import {
  NEO_PULSE_BRAND_LOCKUP_SRC,
} from "@/lib/neo-pulse-branding-assets";
import { Button } from "@/ui";

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // ProtectedRoute sends deep-link visitors here with their target in
  // state.from; send them back there after sign-in instead of home.
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const returnTo =
    from?.pathname && from.pathname !== "/login" && from.pathname !== "/register"
      ? `${from.pathname}${from.search ?? ""}`
      : "/";
  const [users, setUsers] = useState<AuthPickerUser[]>([]);
  const [error, setError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [submittingEmail, setSubmittingEmail] = useState<string | null>(null);

  useEffect(() => {
    clearLegacyDeviceAuth();
  }, []);

  useEffect(() => {
    if (AUTH_DISABLED) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (!loading && user) navigate(returnTo, { replace: true });
  }, [user, loading, navigate, returnTo]);

  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      setListLoading(true);
      setError("");
      try {
        const result = await fetchAuthUsers();
        if (cancelled) return;
        if (!result.ok) {
          setUsers([]);
          setError(result.error || "Could not load users");
          return;
        }
        const list = result.users ?? [];
        setUsers(list);
        if (list.length === 0) {
          setError("No users available");
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
          setError("Could not load users");
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }
    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePick(email: string) {
    setError("");
    setSubmittingEmail(email);
    try {
      const result = await login(email);
      if (result.ok) {
        navigate(returnTo, { replace: true });
      } else {
        setError(result.error || "Unknown email");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmittingEmail(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="neo-pulse-panel-neon w-full max-w-sm space-y-8 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={NEO_PULSE_BRAND_LOCKUP_SRC}
            alt="NEO Pulse"
            className="h-10 w-auto"
          />
          <p className="text-muted-foreground">Choose your email</p>
        </div>
        <div className="space-y-dashboard">
          <div className="min-h-[12rem] space-y-2">
            {listLoading ? (
              <p className="text-base text-muted-foreground">Loading users…</p>
            ) : (
              users.map((u) => (
                <Button
                  key={u.email}
                  type="button"
                  variant="quiet"
                  className="h-auto w-full justify-start gap-3 bg-black px-3 py-3 text-left"
                  disabled={submittingEmail !== null}
                  onClick={() => void handlePick(u.email)}
                >
                  <LogIn className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-foreground">
                      {u.displayName || u.email}
                    </span>
                    <span className="block truncate text-base text-muted-foreground tabular-nums">
                      {u.email}
                    </span>
                  </span>
                  {submittingEmail === u.email ? (
                    <span className="shrink-0 text-base text-muted-foreground">Signing in…</span>
                  ) : null}
                </Button>
              ))
            )}
          </div>
          {error ? (
            <p className="text-base text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-center text-base text-muted-foreground">
            <a href="/terms-of-service" className="hover:underline">
              Terms of Service
            </a>
            {" · "}
            <a href="/privacy-policy" className="hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
