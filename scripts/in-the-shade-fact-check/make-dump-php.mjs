import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const urls = JSON.parse(readFileSync(join(ROOT, "scripts/_tmp-itsf-fact/urls.json"), "utf8"));
const code = `$urls = json_decode(${JSON.stringify(JSON.stringify(urls))}, true);
$out = array();
foreach ($urls as $url) {
  $id = url_to_postid($url);
  if (!$id) {
    $path = wp_parse_url($url, PHP_URL_PATH);
    $slug = basename(untrailingslashit($path));
    $q = new WP_Query(array(
      'name' => $slug,
      'post_type' => 'post',
      'post_status' => 'any',
      'posts_per_page' => 1,
    ));
    if ($q->have_posts()) {
      $id = (int) $q->posts[0]->ID;
    }
  }
  if (!$id) {
    $out[] = array('pageUrl' => $url, 'id' => 0, 'content' => '', 'error' => 'not-found');
    continue;
  }
  $out[] = array(
    'pageUrl' => $url,
    'id' => $id,
    'title' => get_the_title($id),
    'content' => get_post_field('post_content', $id),
  );
}
return array('count' => count($out), 'posts' => $out);`;
writeFileSync(join(ROOT, "scripts/_tmp-itsf-fact/dump-posts.php.txt"), code, "utf8");
console.log("wrote dump-posts.php.txt", code.length);
