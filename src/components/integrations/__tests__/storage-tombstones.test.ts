import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDeletedSitesTombstones,
  getStoredSites,
  isSiteTombstoned,
  recordDeletedSite,
} from "../storage";

describe("storage tombstone and recovery hardening", () => {
  let store: Record<string, string>;

  beforeEach(() => {
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

  it("records a delete for any property name", () => {
    recordDeletedSite({
      id: "wp-generic-1",
      name: "Generic Property Alpha",
      siteUrl: "https://generic-alpha.example",
    });
    const tombstones = getDeletedSitesTombstones();
    expect(tombstones.some((t) => t.name === "generic property alpha")).toBe(true);
    expect(
      isSiteTombstoned({
        id: "wp-generic-1",
        name: "Generic Property Alpha",
        siteUrl: "https://generic-alpha.example",
      }),
    ).toBe(true);
  });

  it("correctly tombstones dr. rebecca and ridgeline solar", () => {
    expect(isSiteTombstoned({ name: "Dr. Rebecca", siteUrl: "https://drrebeccajane.ca" })).toBe(true);
    expect(isSiteTombstoned({ name: "dr. rebecca", siteUrl: "https://drrebeccajane.ca" })).toBe(true);
    expect(isSiteTombstoned({ name: "Ridgeline Solar", siteUrl: "https://ridgelinesolar.ca" })).toBe(true);
  });

  it("ignores corrupted empty tombstone records and cleanses them", () => {
    store["neo-pulse-deleted-wp-sites-v1"] = JSON.stringify([
      { name: "", host: "" },
      { name: "   " },
      { name: "generic property beta", host: "generic-beta.example" },
    ]);

    const cleaned = getDeletedSitesTombstones();
    expect(cleaned.some((t) => !t.name && !t.host && !t.id)).toBe(false);
    expect(cleaned.some((t) => t.name === "generic property beta")).toBe(true);
  });

  it("returns an empty visible list when storage is empty (no bundled seed)", () => {
    const sites = getStoredSites();
    expect(sites).toEqual([]);
  });
});
