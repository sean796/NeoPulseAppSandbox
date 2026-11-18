import fs from 'fs';
import path from 'path';

const dir = 'B:/Neo Pulse/scripts/_tmp-wayback';
const out = [];

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const slug = f.replace(/\.html$/, '');
  let html = fs.readFileSync(path.join(dir, f), 'utf8');
  html = html.replace(/<!-- BEGIN WAYBACK TOOLBAR INSERT -->[\s\S]*?<!-- END WAYBACK TOOLBAR INSERT -->/g, '');

  let title = '';
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
  const t = html.match(/<title>([^<]+)/i);
  title = (og?.[1] || t?.[1] || '').replace(/\s*[|\-].*Blind Magic.*/i, '').trim();

  let body = '';
  const m1 = html.match(
    /<div[^>]+class=["'][^"']*elementor-widget-theme-post-content[^"']*["'][^>]*>[\s\S]*?<div class=["']elementor-widget-container["']>([\s\S]*?)<\/div>/i,
  );
  const m2 = html.match(/<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const m3 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  body = (m1?.[1] || m2?.[1] || m3?.[1] || '').trim();
  body = body
    .replace(/https?:\/\/web\.archive\.org\/web\/\d+id_\//g, '')
    .replace(/https?:\/\/web\.archive\.org\/web\/\d+\//g, '');

  out.push({ slug, title, content: body.slice(0, 250000) });
  console.log(slug, 'title=', JSON.stringify(title), 'content_len=', body.length);
}

fs.writeFileSync(path.join(dir, 'restore.json'), JSON.stringify(out));
console.log('wrote restore.json', out.length);
