import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const id = Number(process.argv[2]);
if (!id) {
  console.error("usage: node build-one-php.mjs <postId>");
  process.exit(1);
}
const job = JSON.parse(readFileSync(join(HERE, `${id}-apply.json`), "utf8"));
const packed = Buffer.from(JSON.stringify(job), "utf8").toString("base64");
const php = `$job = json_decode(base64_decode('${packed}'), true);
$id = (int) $job['id'];
$find = base64_decode($job['find_b64']);
$replace = base64_decode($job['replace_b64']);
$p = get_post($id);
if (!$p) return ['ok' => false, 'err' => 'missing'];
$c = $p->post_content;
if (strpos($c, $find) === false) return ['ok' => false, 'err' => 'find-missing', 'len' => strlen($c)];
$next = str_replace($find, $replace, $c, $count);
if ($count !== 1) return ['ok' => false, 'err' => 'count=' . $count];
wp_update_post(['ID' => $id, 'post_content' => $next]);
return [
  'ok' => true,
  'id' => $id,
  'removed' => $job['removed'],
  'eleanor' => (strpos($next, 'Eleanor') !== false),
  'brenda' => (strpos($next, 'Brenda') !== false),
  'arthurStreet' => (strpos($next, 'Arthur Street') !== false),
];`;
const out = join(HERE, `apply-${id}.php.txt`);
writeFileSync(out, php);
writeFileSync(
  join(HERE, `mcp-php-${id}.json`),
  JSON.stringify({
    operation: "run",
    arguments: {
      code: php,
      note: `Case-study only: remove persona names from post ${id}`,
    },
  }),
);
console.log(JSON.stringify({ id, bytes: php.length, out }));
