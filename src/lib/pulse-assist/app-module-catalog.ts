import catalogJson from "./app-module-catalog.json";
import type { AssistAppCatalog, AssistAppModule } from "./app-module-catalog.types";

export type { AssistAppModule, AssistAppCatalog };

const catalog = catalogJson as AssistAppCatalog;

export const ASSIST_APP_MODULES: AssistAppModule[] = catalog.modules;

const byId = new Map(ASSIST_APP_MODULES.map((m) => [m.id, m]));

export function getAssistModuleById(id: string): AssistAppModule | undefined {
  return byId.get(id);
}

export function lookupAssistModules(queries: string[]): AssistAppModule[] {
  const out: AssistAppModule[] = [];
  const seen = new Set<string>();

  for (const raw of queries) {
    const q = raw.trim().toLowerCase();
    if (!q) continue;

    for (const mod of ASSIST_APP_MODULES) {
      if (seen.has(mod.id)) continue;
      const hay = [
        mod.id,
        mod.label,
        mod.menuPath,
        ...(mod.aliases ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (mod.id.toLowerCase() === q || hay.includes(q)) {
        out.push(mod);
        seen.add(mod.id);
      }
    }
  }

  return out;
}

export type LocationSummaryInput = {
  managerTab: string;
  dashboardCluster?: string;
  generatorSection?: string;
  sitemapSource?: string;
  researchSection?: string;
  sitemapMode?: string;
  contentOptimizerSection?: string;
};

export function resolveCurrentModuleId(input: LocationSummaryInput): string | undefined {
  const tab = input.managerTab;
  if (tab === "dashboard" && input.dashboardCluster) {
    return `dashboard/${input.dashboardCluster}`;
  }
  if (tab === "generator" && input.generatorSection) {
    return `generator/${input.generatorSection}`;
  }
  return ASSIST_APP_MODULES.find((m) => m.managerTab === tab && !m.generatorSection && !m.dashboardCluster)?.id;
}

export function buildLocationSummary(input: LocationSummaryInput): string {
  const modId = resolveCurrentModuleId(input);
  const mod = modId ? getAssistModuleById(modId) : undefined;
  if (mod) {
    let path = mod.menuPath;
    if (input.sitemapSource && mod.id === "generator/opt") {
      path += ` → ${input.sitemapSource}`;
    }
    if (input.contentOptimizerSection === "multi-site" && mod.id === "generator/opt") {
      path += " → Multi-site";
    }
    if (input.researchSection && mod.id === "generator/research") {
      path += ` → ${input.researchSection.replace("research-", "")}`;
    }
    if (input.sitemapMode && mod.id === "sitemap-optimizer") {
      path += ` → ${input.sitemapMode}`;
    }
    return path;
  }
  return tabLabel(input.managerTab);
}

function tabLabel(tab: string): string {
  const m = ASSIST_APP_MODULES.find((x) => x.managerTab === tab && !x.generatorSection && !x.dashboardCluster);
  return m?.menuPath ?? tab;
}
