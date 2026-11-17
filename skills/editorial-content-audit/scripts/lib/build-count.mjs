/**
 * Build page counts from inventory JSON.
 *
 * @param {object} inventory
 * @returns {{ pageCount: number, postCount: number, entityCount: number, goalMet: boolean, pages: object[] }}
 */
export function buildCountResult(inventory) {
  const pages = Array.isArray(inventory?.pages) ? inventory.pages : [];
  let postCount = 0;
  let entityCount = 0;
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const type = String(page.type ?? page.postType ?? "");
    if (type === "post" || type === "posts") postCount += 1;
    else entityCount += 1;
  }
  const pageCount = postCount + entityCount;
  return {
    pageCount,
    postCount,
    entityCount,
    goalMet: pageCount === 0,
    pages: pages.map((page) => ({
      id: Number(page.id) || 0,
      url: String(page.url ?? page.link ?? ""),
      title: String(page.title ?? ""),
      status: String(page.status ?? ""),
      type: String(page.type ?? page.postType ?? ""),
    })),
  };
}
