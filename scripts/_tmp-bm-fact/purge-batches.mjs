import { readFileSync, writeFileSync } from "node:fs";

const list = [
  ...new Set(
    JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates-reweave.json", "utf8")).updates.map((u) => u.pageUrl),
  ),
];

function makeCode(urls) {
  return `$urls = json_decode(${JSON.stringify(JSON.stringify(urls))}, true);
$ok = 0;
$errors = array();
foreach ($urls as $url) {
  try {
    if (function_exists('nitropack_sdk_purge')) nitropack_sdk_purge($url);
    elseif (function_exists('nitropack_purge')) nitropack_purge($url);
    $ok++;
  } catch (Throwable $e) {
    $errors[] = $url . ': ' . $e->getMessage();
  }
}
if (function_exists('nitropack_sdk_purge_local')) nitropack_sdk_purge_local();
return array('purged' => $ok, 'errors' => array_slice($errors, 0, 10), 'count' => count($urls));
`;
}

const mid = Math.ceil(list.length / 2);
writeFileSync("scripts/_tmp-bm-fact/purge-batch-1.php.txt", makeCode(list.slice(0, mid)));
writeFileSync("scripts/_tmp-bm-fact/purge-batch-2.php.txt", makeCode(list.slice(mid)));
console.log(JSON.stringify({ total: list.length, mid, b1: mid, b2: list.length - mid }));
