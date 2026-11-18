import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import SftpClient from "ssh2-sftp-client";

const dir = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(dir, "../../wordpress-plugins/.deploy/wpengine-sftp-catalog.json"), "utf8"),
);
const catalogSite = catalog.rows.find(
  (row) => row.site === "intheshadeflorida.com" && !row.isStaging && row.password,
);
const probe = readFileSync(
  join(dir, "../../wordpress-plugins/.deploy/run-intheshade-fatal-probe.mjs"),
  "utf8",
);
const fallbackUser = probe.match(/username: "(intheshade-[^"]+)"/);
const fallbackPass = probe.match(/password: "([^"]+)"/);
const fallback =
  fallbackUser && fallbackPass
    ? {
        host: "intheshade.sftp.wpengine.com",
        port: 2222,
        username: fallbackUser[1],
        password: fallbackPass[1],
      }
    : null;
const candidates = [catalogSite, fallback].filter(Boolean);

const php = readFileSync(join(dir, "intheshade-audit-redirects.php"));
let sftp = null;
let connected = null;
for (const site of candidates) {
  const client = new SftpClient();
  try {
    await client.connect({
      host: site.host,
      port: Number(site.port) || 2222,
      username: site.username,
      password: site.password,
      readyTimeout: 60000,
      algorithms: {
        serverHostKey: ["ssh-rsa", "rsa-sha2-512", "rsa-sha2-256", "ecdsa-sha2-nistp256", "ssh-ed25519"],
      },
    });
    sftp = client;
    connected = site.username;
    break;
  } catch {
    console.log(`auth failed for ${site.username}`);
  }
}
if (!sftp || !connected) throw new Error("No In The Shade SFTP login worked");
console.log(`connected ${connected}`);
const remoteDir = "./wp-content/mu-plugins";
const exists = await sftp.exists(remoteDir);
if (!exists) await sftp.mkdir(remoteDir, true);
await sftp.put(php, `${remoteDir}/intheshade-audit-redirects.php`);
const stat = await sftp.stat(`${remoteDir}/intheshade-audit-redirects.php`);
await sftp.end();
console.log(`uploaded ${stat.size} bytes`);
