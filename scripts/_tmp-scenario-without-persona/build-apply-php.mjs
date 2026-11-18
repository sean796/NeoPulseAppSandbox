import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const jobs = [5668, 5636].map((id) =>
  JSON.parse(readFileSync(join(HERE, `${id}-apply.json`), "utf8")),
);
const packed = Buffer.from(JSON.stringify(jobs), "utf8").toString("base64");
const php = `\$jobs = json_decode(base64_decode('${packed}'), true);
\$out = [];
foreach (\$jobs as \$job) {
  \$id = (int) \$job['id'];
  \$find = base64_decode(\$job['find_b64']);
  \$replace = base64_decode(\$job['replace_b64']);
  \$p = get_post(\$id);
  if (!\$p) { \$out[] = ['id' => \$id, 'ok' => false, 'err' => 'missing']; continue; }
  \$c = \$p->post_content;
  if (strpos(\$c, \$find) === false) {
    \$out[] = ['id' => \$id, 'ok' => false, 'err' => 'find-missing', 'len' => strlen(\$c)];
    continue;
  }
  \$next = str_replace(\$find, \$replace, \$c, \$count);
  if (\$count !== 1) { \$out[] = ['id' => \$id, 'ok' => false, 'err' => 'count=' . \$count]; continue; }
  wp_update_post(['ID' => \$id, 'post_content' => \$next]);
  \$out[] = [
    'id' => \$id,
    'ok' => true,
    'removed' => \$job['removed'],
    'arthurStreet' => (strpos(\$next, 'Arthur Street') !== false),
    'eleanor' => (strpos(\$next, 'Eleanor') !== false),
    'brenda' => (strpos(\$next, 'Brenda') !== false),
  ];
}
return \$out;`;
writeFileSync(join(HERE, "apply-advance.php.txt"), php);
console.log(JSON.stringify({ bytes: php.length, jobs: jobs.length }));
