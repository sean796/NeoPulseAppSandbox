import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const urls = JSON.parse(readFileSync(join(ROOT, "scripts/_tmp-bm-fact/urls.json"), "utf8"));
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
return array('purged' => $ok, 'errors' => array_slice($errors, 0, 20));`;
writeFileSync(join(ROOT, "scripts/_tmp-bm-fact/purge.php.txt"), code, "utf8");
console.log("purge php bytes", code.length);
