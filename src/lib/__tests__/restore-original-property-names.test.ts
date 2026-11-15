import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";

describe("restore name selection (longest wins)", () => {
  it("documents expected merge priority for NAP labels", () => {
    const site = {
      name: "Blind Magic",
      napInfo: { name: "Blind Magic Custom Blinds & Drapery" },
    } as WordPressSite;
    const candidates = [site.name, site.napInfo?.name ?? ""].map((c) => c.trim()).filter(Boolean);
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    expect(best).toBe("Blind Magic Custom Blinds & Drapery");
  });
});
