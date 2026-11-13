import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDPRESS_SITES_STORAGE_KEY, type WordPressSite } from "../types";

const site = (id: string, name: string): WordPressSite => ({
  id,
  name,
  siteUrl: `https://${id}.example`,
  username: "user",
  appPassword: "pass",
  connectedAt: 1,
});

describe("loadSitesFromServerAlways", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.resetModules();
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    } satisfies Storage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/manager-wordpress-properties/load")) {
          return {
            ok: true,
            json: async () => ({
              sites: [site("heritage", "Heritage Dental Center"), site("sunnydale", "Sunnydale Solar")],
            }),
          };
        }
        if (url.includes("/api/auth/me") || url.includes("/auth/me")) {
          return { ok: true, json: async () => ({ ok: true, activeTeam: { id: 1 } }) };
        }
        if (url.includes("/manager-cloud-settings/load") || url.includes("/teams/1/workspace")) {
          return { ok: true, json: async () => ({ ok: true, snapshot: null }) };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always replaces memory with the server mirror even when localStorage has sites", async () => {
    store[WORDPRESS_SITES_STORAGE_KEY] = JSON.stringify([site("other", "Other Client")]);

    const { loadSitesFromServerAlways, getStoredSites } = await import("../storage");
    const restored = await loadSitesFromServerAlways();

    expect(restored).toHaveLength(2);
    expect(restored.map((s) => s.name).sort()).toEqual(["Heritage Dental Center", "Sunnydale Solar"]);
    expect(getStoredSites()).toHaveLength(2);
    expect(store[WORDPRESS_SITES_STORAGE_KEY]).toBeUndefined();
    expect(fetch).toHaveBeenCalled();
  });

  it("hydrates from server mirror when memory is empty", async () => {
    const { loadSitesFromServerAlways, getStoredSites } = await import("../storage");
    const restored = await loadSitesFromServerAlways();

    expect(restored).toHaveLength(2);
    expect(getStoredSites()).toHaveLength(2);
    expect(fetch).toHaveBeenCalled();
  });

  it("restoreSitesFromServerMirrorIfEmpty delegates to always-load", async () => {
    store[WORDPRESS_SITES_STORAGE_KEY] = JSON.stringify([site("other", "Other Client")]);
    const { restoreSitesFromServerMirrorIfEmpty, getStoredSites } = await import("../storage");
    const restored = await restoreSitesFromServerMirrorIfEmpty();
    expect(restored).toHaveLength(2);
    expect(getStoredSites().some((s) => s.name === "Other Client")).toBe(false);
  });
});

describe("loadSitesFromServerAlways credential merge", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.resetModules();
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    } satisfies Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("merges workspace credentials onto the public server mirror", async () => {
    const csol = site("csol", "Custom Shades of London");
    csol.siteUrl = "https://www.customshadesoflondon.ca/";
    csol.id = "wp-csol";
    const publicRow = { ...csol, appPassword: "" };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/manager-wordpress-properties/load")) {
          return {
            ok: true,
            json: async () => ({ sites: [publicRow] }),
          };
        }
        if (url.includes("/api/auth/me") || url.includes("/auth/me")) {
          return { ok: true, json: async () => ({ ok: true, activeTeam: { id: 1 } }) };
        }
        if (url.includes("/manager-cloud-settings/load")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              snapshot: {
                version: 1,
                keys: { wordpress_sites: JSON.stringify([csol]) },
              },
            }),
          };
        }
        if (url.includes("/teams/1/workspace")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              snapshot: {
                version: 1,
                keys: { wordpress_sites: JSON.stringify([csol]) },
              },
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    const { loadSitesFromServerAlways, getStoredSites } = await import("../storage");
    const loaded = await loadSitesFromServerAlways();

    expect(loaded).toHaveLength(1);
    expect(getStoredSites()[0]?.appPassword).toBe("pass");
    expect(getStoredSites()[0]?.name).toBe("Custom Shades of London");
  });
});
