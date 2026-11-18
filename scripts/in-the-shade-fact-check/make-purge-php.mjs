import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(ROOT, "scripts/_tmp-itsf-fact");

function loadUrls() {
  const purgeUrlsPath = join(DIR, "purge-urls.json");
  if (existsSync(purgeUrlsPath)) {
    return JSON.parse(readFileSync(purgeUrlsPath, "utf8"));
  }
  const livePath = join(DIR, "live-contents.json");
  if (existsSync(livePath)) {
    const live = JSON.parse(readFileSync(livePath, "utf8"));
    const withContent = (live.posts || [])
      .filter((p) => p.id && p.content)
      .map((p) => p.pageUrl)
      .filter(Boolean);
    if (withContent.length) return [...new Set(withContent)];
  }
  const applyPath = join(DIR, "apply-report.json");
  if (existsSync(applyPath)) {
    const apply = JSON.parse(readFileSync(applyPath, "utf8"));
    const fromApply = (apply.results || []).filter((r) => r.ok && r.pageUrl).map((r) => r.pageUrl);
    if (fromApply.length) return [...new Set(fromApply)];
  }
  return JSON.parse(readFileSync(join(DIR, "urls.json"), "utf8"));
}

const urls = loadUrls();
const code = `$urls = json_decode(${JSON.stringify(JSON.stringify(urls))}, true);
$ok = 0;
$errors = array();
foreach ($urls as $url) {
  try {
    if (function_exists('nitropack_sdk_purge')) {
      nitropack_sdk_purge($url);
    } elseif (function_exists('nitropack_purge')) {
      nitropack_purge($url);
    }
    $ok++;
  } catch (Throwable $e) {
    $errors[] = $url . ': ' . $e->getMessage();
  }
}
if (function_exists('nitropack_sdk_purge_local')) {
  nitropack_sdk_purge_local();
}
return array('purged' => $ok, 'errors' => array_slice($errors, 0, 20), 'count' => count($urls));`;
writeFileSync(join(DIR, "purge.php.txt"), code, "utf8");
console.log(JSON.stringify({ purgePhpBytes: code.length, urlCount: urls.length }, null, 2));
