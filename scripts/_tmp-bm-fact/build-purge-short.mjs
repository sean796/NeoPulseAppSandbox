import { readFileSync, writeFileSync } from "node:fs";

const list = [
  ...new Set(
    JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates-reweave.json", "utf8")).updates.map((u) => u.pageUrl),
  ),
];
const code = `$urls = json_decode(${JSON.stringify(JSON.stringify(list))}, true);
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
return array('purged' => $ok, 'errors' => array_slice($errors, 0, 20), 'count' => count($urls));
`;
writeFileSync("scripts/_tmp-bm-fact/purge-short.php.txt", code);
console.log(JSON.stringify({ urls: list.length, bytes: code.length }));
