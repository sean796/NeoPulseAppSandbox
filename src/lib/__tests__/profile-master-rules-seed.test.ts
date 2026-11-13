import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setServerHarnessSitesOverride } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import {
  KWB_BRAND_RULE_CONTENT,
  PROFILE_BRAND_NAMING_FILENAME,
  SHUTTER_SPOT_BRAND_RULE_CONTENT,
} from "../profile-master-rules";
import {
  clearMasterInstructionsTestCache,
  getMasterInstructionsPayload,
} from "../master-instructions-storage";

function siteRow(
  id: string,
  name: string,
  siteUrl: string,
  extra: Partial<WordPressSite> = {},
): WordPressSite {
  return {
    id,
    name,
    siteUrl,
    username: "user",
    appPassword: "pass",
    connectedAt: 1,
    enabled: true,
    ...extra,
  };
}

describe("KWB profile master rules", () => {
  const siteId = "test-kwb-profile-master-rules";
  const lsStore = new Map<string, string>();

  beforeEach(() => {
    lsStore.clear();
    setServerHarnessSitesOverride(null);
    const storage = {
      getItem: (key: string) => lsStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        lsStore.set(key, value);
      },
      removeItem: (key: string) => {
        lsStore.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage } as Window);
    clearMasterInstructionsTestCache();
  });

  afterEach(() => {
    setServerHarnessSitesOverride(null);
    clearMasterInstructionsTestCache();
    vi.unstubAllGlobals();
  });

  function seedKwbSite(name = "KWB", siteUrl = "https://kwbllp.com/") {
    setServerHarnessSitesOverride([siteRow(siteId, name, siteUrl)]);
  }

  it("adds KWB brand naming rule when master rules load for kwbllp.com", () => {
    seedKwbSite();
    const payload = getMasterInstructionsPayload(siteId);
    const row = payload.sources.find((s) => s.name === PROFILE_BRAND_NAMING_FILENAME);
    expect(row?.kind).toBe("semantic-triples");
    expect(row?.content).toContain("KWB Accountants & Advisors");
    expect(row?.content).toContain("KWB CPAs");
    expect(row?.content).toContain("KWB LLP");
    expect(row?.content).toContain("Yellowknife");
    expect(row?.content).toContain("Red Deer");
    expect(row?.content).toContain("[KWB office geography]");
  });

  it("updates an outdated KWB profile rule in place", () => {
    seedKwbSite();
    const storageKey = `neo_pulse_wp_master_instructions_${siteId}`;
    lsStore.set(
      storageKey,
      JSON.stringify({
        sources: [
          {
            name: PROFILE_BRAND_NAMING_FILENAME,
            content: "[KWB brand naming]\nrule\tOld rule without office geography.",
            uploadedAt: 1,
            kind: "semantic-triples",
          },
        ],
      }),
    );
    const payload = getMasterInstructionsPayload(siteId);
    const row = payload.sources.find((s) => s.name === PROFILE_BRAND_NAMING_FILENAME);
    expect(row?.content).toContain("Yellowknife");
    expect(row?.content).toBe(KWB_BRAND_RULE_CONTENT);
  });

  it("does not duplicate the rule on second load", () => {
    seedKwbSite();
    getMasterInstructionsPayload(siteId);
    const payload = getMasterInstructionsPayload(siteId);
    expect(
      payload.sources.filter((s) => s.name === PROFILE_BRAND_NAMING_FILENAME),
    ).toHaveLength(1);
  });

  it("matches KWB by name when URL is empty", () => {
    seedKwbSite("KWB LLP", "");
    const payload = getMasterInstructionsPayload(siteId);
    expect(payload.sources.some((s) => s.name === PROFILE_BRAND_NAMING_FILENAME)).toBe(true);
  });

  it("skips non-KWB sites", () => {
    setServerHarnessSitesOverride([siteRow(siteId, "Example Co", "https://example.com/")]);
    const payload = getMasterInstructionsPayload(siteId);
    expect(payload.sources).toHaveLength(0);
  });
});

describe("Shutter Spot profile master rules", () => {
  const siteId = "test-shutter-spot-profile-master-rules";
  const lsStore = new Map<string, string>();

  beforeEach(() => {
    lsStore.clear();
    setServerHarnessSitesOverride(null);
    const storage = {
      getItem: (key: string) => lsStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        lsStore.set(key, value);
      },
      removeItem: (key: string) => {
        lsStore.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage } as Window);
    clearMasterInstructionsTestCache();
  });

  afterEach(() => {
    setServerHarnessSitesOverride(null);
    clearMasterInstructionsTestCache();
    vi.unstubAllGlobals();
  });

  function seedShutterSpotSite(
    name = "Shutter Spot",
    siteUrl = "https://shutterspot.com/",
    googleAdsCustomerId = "745-406-1453",
  ) {
    setServerHarnessSitesOverride([siteRow(siteId, name, siteUrl, { googleAdsCustomerId })]);
  }

  it("adds Shutter Spot brand naming rule when master rules load for shutterspot.com", () => {
    seedShutterSpotSite();
    const payload = getMasterInstructionsPayload(siteId);
    const row = payload.sources.find((s) => s.name === PROFILE_BRAND_NAMING_FILENAME);
    expect(row?.kind).toBe("semantic-triples");
    expect(row?.content).toContain("Shutter Spot");
    expect(row?.content).toContain("Blind Spot");
    expect(row?.content).toContain("Do not substitute Blind Spot");
  });

  it("seeds for legacy Blind Spot name with matching Ads customer id", () => {
    seedShutterSpotSite("Blind Spot", "", "7454061453");
    const payload = getMasterInstructionsPayload(siteId);
    expect(payload.sources.some((s) => s.name === PROFILE_BRAND_NAMING_FILENAME)).toBe(true);
    const row = payload.sources.find((s) => s.name === PROFILE_BRAND_NAMING_FILENAME);
    expect(row?.content).toBe(SHUTTER_SPOT_BRAND_RULE_CONTENT);
  });

  it("updates an outdated Shutter Spot profile rule in place", () => {
    seedShutterSpotSite();
    const storageKey = `neo_pulse_wp_master_instructions_${siteId}`;
    lsStore.set(
      storageKey,
      JSON.stringify({
        sources: [
          {
            name: PROFILE_BRAND_NAMING_FILENAME,
            content: "[Shutter Spot brand naming]\nrule\tOld rule without canonical name.",
            uploadedAt: 1,
            kind: "semantic-triples",
          },
        ],
      }),
    );
    const payload = getMasterInstructionsPayload(siteId);
    const row = payload.sources.find((s) => s.name === PROFILE_BRAND_NAMING_FILENAME);
    expect(row?.content).toBe(SHUTTER_SPOT_BRAND_RULE_CONTENT);
  });

  it("does not duplicate the rule on second load", () => {
    seedShutterSpotSite();
    getMasterInstructionsPayload(siteId);
    const payload = getMasterInstructionsPayload(siteId);
    expect(
      payload.sources.filter((s) => s.name === PROFILE_BRAND_NAMING_FILENAME),
    ).toHaveLength(1);
  });
});
