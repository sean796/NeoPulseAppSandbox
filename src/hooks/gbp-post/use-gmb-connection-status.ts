import { useCallback, useEffect, useState } from "react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export function useGmbConnectionStatus(): {
  connected: boolean;
  loading: boolean;
  refresh: () => void;
} {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const cacheBust = `_=${Date.now()}`;
    fetch(`${BACKEND_API_BASE}/api/gmb/status?${cacheBust}`, {
      credentials: "include",
      cache: "no-store",
      headers: neoPulseApiHeaders(),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!cancelled) setConnected(Boolean(data?.connected));
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const onFocus = () => setTick((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return { connected, loading, refresh };
}
