/** Build pageCount from published blog inventory. */

export function buildCount(inventory) {
  const pages = Array.isArray(inventory?.pages) ? inventory.pages : [];
  const blog = pages.filter((page) => {
    if (!page || typeof page !== "object") return false;
    const url = String(page.url ?? "");
    const status = String(page.status ?? "publish");
    const type = String(page.type ?? "post");
    return type === "post" && status === "publish" && url.includes("/blog/");
  });
  return {
    siteId: String(inventory?.siteId ?? ""),
    pageCount: blog.length,
    pages: blog.map((page) => ({
      id: Number(page.id ?? 0),
      url: String(page.url ?? ""),
      title: String(page.title ?? ""),
      dateGmt: String(page.dateGmt ?? page.date_gmt ?? ""),
    })),
  };
}
