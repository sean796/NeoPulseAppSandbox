const STORAGE_KEY = "neo-pulse_device_auth";
const SESSION_TOKEN_KEY = "neo_pulse_session_token";

let memorySessionToken: string | null = null;

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

/** Removes the old email+password localStorage blob so it cannot be replayed. */
export function clearLegacyDeviceAuth(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function setSessionToken(sessionToken: string | null): void {
  memorySessionToken = sessionToken;
  if (!hasBrowserStorage()) return;
  if (sessionToken) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    return;
  }
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export function getSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  if (hasBrowserStorage()) {
    const fromSession = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (fromSession) {
      memorySessionToken = fromSession;
      return fromSession;
    }
  }
  return null;
}

export function saveSessionToken(sessionToken: string): void {
  setSessionToken(sessionToken);
}

export function loadSessionToken(): string | null {
  return getSessionToken();
}

export function clearDeviceAuth(): void {
  clearLegacyDeviceAuth();
  setSessionToken(null);
}
