import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const updates = JSON.parse(readFileSync(join(dir, "updates.json"), "utf8")).updates || [];
const urls = updates.map((u) => u.pageUrl);
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
writeFileSync(join(dir, "purge-applied.php.txt"), code, "utf8");
console.log(JSON.stringify({ urls: urls.length, bytes: code.length }, null, 2));
