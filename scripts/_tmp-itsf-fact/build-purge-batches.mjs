import { readFileSync, writeFileSync } from "node:fs";

const urls = JSON.parse(readFileSync("scripts/_tmp-itsf-fact/purge-urls.json", "utf8"));

function makeCode(batch) {
  return `$urls = json_decode(${JSON.stringify(JSON.stringify(batch))}, true);
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

const size = 40;
const batches = [];
for (let i = 0; i < urls.length; i += size) {
  const batch = urls.slice(i, i + size);
  const idx = batches.length + 1;
  const path = `scripts/_tmp-itsf-fact/purge-batch-${idx}.php.txt`;
  writeFileSync(path, makeCode(batch));
  batches.push({ idx, path, count: batch.length });
}
writeFileSync("scripts/_tmp-itsf-fact/purge-batches.json", JSON.stringify({ total: urls.length, batches }, null, 2));
console.log(JSON.stringify({ total: urls.length, batches }, null, 2));
