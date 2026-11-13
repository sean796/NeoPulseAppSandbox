import type { WordPressSite } from '@/components/integrations/types';
import { extractEndpointFromEntitySitemapUrl } from '@/lib/entity-endpoint-extractor';
import { isCompetitorCsvKeyword } from '@/lib/competitor-research/competitor-csv-row';
import { overviewEntityRestCollectionForSite } from '@/lib/overview/overview-sitemap-source';

type RowWithKeyword = { keyword?: string };

function isLocationEntitySitemapUrl(url: string): boolean {
  const tail = (url.split('/').pop() ?? '').toLowerCase();
  return (
    tail.includes('location-sitemap') ||
    tail.includes('locations-sitemap') ||
    tail.includes('location_sitemap')
  );
}

function defaultServiceAreaSitemapUrl(site: Pick<WordPressSite, 'siteUrl'>): string | undefined {
  const origin = (site.siteUrl || '').trim().replace(/\/+$/, '');
  if (!origin) return undefined;
  const base = origin.startsWith('http') ? origin : `https://${origin}`;
  return `${base}/service-area-sitemap.xml`;
}

export function resolveEntitySitemapUrlForRow(
  site: WordPressSite,
  row: RowWithKeyword,
): string | undefined {
  if (isCompetitorCsvKeyword(row.keyword)) {
    return site.competitorEntitySitemapUrl?.trim() || undefined;
  }
  const configured = site.entitySitemapUrl?.trim();
  if (configured && !isLocationEntitySitemapUrl(configured)) return configured;
  return defaultServiceAreaSitemapUrl(site);
}

export function requireEntitySitemapUrlForRow(site: WordPressSite, row: RowWithKeyword): string {
  const url = resolveEntitySitemapUrlForRow(site, row);
  if (!url) {
    if (isCompetitorCsvKeyword(row.keyword)) {
      throw new Error(
        'Competitor sitemap URL is not configured for this property. Set it in Integrations (Sitemap menu: use competitor-sitemap.xml).',
      );
    }
    throw new Error('Entity sitemap URL is not configured for this property.');
  }
  return url;
}

export function resolveEntityEndpointForRow(
  site: WordPressSite,
  row: RowWithKeyword,
  sitemapType: 'entity' | 'post' | undefined,
): string {
  if (sitemapType !== 'entity') {
    return 'posts';
  }
  // Always service-area for SAP (never Locations CPT, never blog posts).
  const fromOverview = overviewEntityRestCollectionForSite(site);
  if (fromOverview) return fromOverview;
  const sitemapUrl = requireEntitySitemapUrlForRow(site, row);
  const fromUrl = extractEndpointFromEntitySitemapUrl(sitemapUrl);
  if (fromUrl === 'location' || fromUrl === 'locations') return 'service-area';
  return fromUrl || 'service-area';
}
