import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const b64 = fs.readFileSync(path.join(dir, "repaired-content.b64.txt"), "utf8").trim();
const code = [
  `$html = base64_decode('${b64}');`,
  `if ($html === false || $html === '') { return ['ok' => false, 'error' => 'decode failed']; }`,
  `$r = wp_update_post(['ID' => 23324, 'post_content' => $html], true);`,
  `if (is_wp_error($r)) { return ['ok' => false, 'error' => $r->get_error_message()]; }`,
  `clean_post_cache(23324);`,
  `return [`,
  `  'ok' => true,`,
  `  'id' => (int) $r,`,
  `  'len' => strlen($html),`,
  `  'has_research' => str_contains($html, 'research-and-fact-checking'),`,
  `  'h2_count' => substr_count(strtolower($html), '<h2'),`,
  `];`,
].join("\n");
fs.writeFileSync(path.join(dir, "update-post.php.txt"), code);
console.log("wrote update-post.php.txt", code.length);
