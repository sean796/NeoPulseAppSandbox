/** Build entity / SAP generator execution payload from count + plan. */

export function buildEntitySapPayload(count, plan) {
  const gap = Number(count.gap);
  const month = String(count.month);
  const days = plan.publishDates.map((ymd) => Number(String(ymd).slice(8, 10)));
  return {
    locationSource: "grid",
    entityUseEditorialPackage: false,
    entityPageCount: gap,
    postCount: gap,
    scheduleTimesPerMonth: gap,
    scheduleCustomInterval: gap,
    sitemapType: "entity",
    featuredImage: false,
    postDestination: "wordpress",
    scheduleFrequency: "custom",
    scheduleCustomStartDate: `${month}-01`,
    scheduleStartDay: 1,
    scheduleStartTime: plan.publishTime,
    schedulePublishDays: days,
    scheduleStaggerOptimized: true,
    targetBucket: "sap",
    saveLocalArchive: true,
  };
}

export function buildDryRunResult(siteId, count, plan) {
  return {
    ok: true,
    dryRun: true,
    siteId,
    month: count.month,
    gap: count.gap,
    payload: buildEntitySapPayload(count, plan),
  };
}
