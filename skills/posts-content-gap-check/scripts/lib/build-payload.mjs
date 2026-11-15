/** Build Blog Ideas / post_creator execution payload from count + plan. */

export function buildPostCreatorPayload(count, plan) {
  const gap = Number(count.gap);
  const month = String(count.month);
  const days = plan.publishDates.map((ymd) => Number(String(ymd).slice(8, 10)));
  return {
    postCount: gap,
    scheduleTimesPerMonth: gap,
    keywordSource: "gsc",
    sitemapType: "post",
    featuredImage: true,
    postDestination: "wordpress",
    scheduleFrequency: "custom",
    scheduleCustomStartDate: `${month}-01`,
    scheduleStartDay: 1,
    scheduleStartTime: plan.publishTime,
    schedulePublishDays: days,
    scheduleStaggerOptimized: true,
    targetBucket: "posts",
    saveLocalArchive: true,
  };
}

/** Agent-run body for Blog Ideas. Site credentials travel with the run for every client. */
export function buildPostCreatorRunBody({ teamId, site, payload, title }) {
  const siteId = String(site?.id ?? "");
  return {
    teamId: Number(teamId),
    source: "pulse_assist",
    recipeKey: "post_creator",
    title,
    context: {
      siteId,
      managerTab: "generator",
    },
    plan: {
      executionMode: "server",
      executionKind: "post_creator",
      executionPayload: {
        ...payload,
        siteId,
        wordpressSiteId: siteId,
      },
      site: {
        id: siteId,
        name: String(site?.name ?? ""),
        siteUrl: String(site?.siteUrl ?? ""),
        username: String(site?.username ?? ""),
        appPassword: String(site?.appPassword ?? ""),
      },
    },
  };
}

export function buildDryRunResult(siteId, count, plan) {
  return {
    ok: true,
    dryRun: true,
    siteId,
    month: count.month,
    gap: count.gap,
    payload: buildPostCreatorPayload(count, plan),
  };
}
