// Cut a self-hosted release: build the extension, zip dist/, hash it, and emit
// latest.json for the updater. Run: npm run release  (or: npm run release -- --no-build)
//
// Upload BOTH release/pne-lc-ai-<version>.zip and release/latest.json to
// https://ai.lcportal.cloud/ext/ . Bump "version" in public/manifest.json before
// releasing — it is the single source of truth the updater compares against.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { createZip } from "./lib/zip.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const BASE_URL = (process.env.LC_RELEASE_BASE_URL || "https://ai.lcportal.cloud/ext").replace(/\/$/, "");

if (!process.argv.includes("--no-build")) {
  console.log("› Building extension (npm run build)...");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}

const manifest = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"));
const version = manifest.version;
if (!version) {
  console.error("✗ dist/manifest.json has no version");
  process.exit(1);
}
if (!manifest.key) {
  console.error("✗ dist/manifest.json has no `key` — run `npm run gen-key` and add it, or the extension ID will drift.");
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(distDir).map((full) => ({
  name: relative(distDir, full).split("\\").join("/"), // zip uses forward slashes
  data: readFileSync(full),
}));

const zipName = `pne-lc-ai-${version}.zip`;
const zipBuf = createZip(files);
mkdirSync(releaseDir, { recursive: true });
writeFileSync(join(releaseDir, zipName), zipBuf);

const sha256 = createHash("sha256").update(zipBuf).digest("hex");
const latest = { version, zip_url: `${BASE_URL}/${zipName}`, sha256 };
writeFileSync(join(releaseDir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

console.log(`\n✓ release/${zipName}  (${(zipBuf.length / 1024).toFixed(0)} KB, ${files.length} files)`);
console.log("✓ release/latest.json");
console.log(`   version: ${version}`);
console.log(`   sha256:  ${sha256}`);
console.log(`\nNext: upload both files to ${BASE_URL}/`);
