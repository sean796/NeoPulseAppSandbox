import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
for (const id of [5668, 5636]) {
  const j = JSON.parse(readFileSync(join(HERE, `${id}-rewrite.json`), "utf8"));
  writeFileSync(join(HERE, `${id}-find.txt`), j.find);
  writeFileSync(join(HERE, `${id}-replace.txt`), j.replace);
  writeFileSync(
    join(HERE, `${id}-apply.json`),
    JSON.stringify({
      id,
      find_b64: Buffer.from(j.find, "utf8").toString("base64"),
      replace_b64: Buffer.from(j.replace, "utf8").toString("base64"),
      removed: j.removedNames,
    }),
  );
  console.log(JSON.stringify({ id, findChars: j.find.length, replaceChars: j.replace.length, removed: j.removedNames, h2: (j.find.match(/<h2/gi) || []).length }));
}
