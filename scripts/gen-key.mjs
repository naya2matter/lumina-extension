// Generate a stable Chrome extension identity. Run once: npm run gen-key
//
// Chrome derives an extension's ID from its public key. When you "Load unpacked"
// a folder that has NO `key` in its manifest, Chrome assigns a random ID that
// changes per machine — which breaks native messaging (the host allow-lists a
// fixed `chrome-extension://<id>/`). Adding the `key` below pins the ID forever.
//
// This prints two things:
//   1. `key`  → paste into public/manifest.json  ("key": "...")
//   2. the derived 32-char extension ID → paste into the native-host manifest's
//      allowed_origins and the installers.
//
// We load the extension UNPACKED (no .crx), so only the PUBLIC key matters. The
// private key is written to keys/ (git-ignored) purely so the same identity can
// be regenerated or reused for CRX signing later — it is NOT needed at runtime.

import { generateKeyPairSync, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, "..", "keys");

if (existsSync(join(keysDir, "extension-key.pem"))) {
  console.error(
    "✗ keys/extension-key.pem already exists. Delete it first if you really want a NEW identity\n" +
      "  (this changes the extension ID and will break existing installs).",
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

// `key` field = base64 of the DER-encoded SubjectPublicKeyInfo (SPKI).
const spkiDer = publicKey.export({ type: "spki", format: "der" });
const keyField = spkiDer.toString("base64");

// Extension ID = first 16 bytes of SHA-256(spkiDer), each nibble mapped 0-f -> a-p.
const digest = createHash("sha256").update(spkiDer).digest();
const extensionId = [...digest.subarray(0, 16)]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("")
  .split("")
  .map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16)))
  .join("");

mkdirSync(keysDir, { recursive: true });
writeFileSync(
  join(keysDir, "extension-key.pem"),
  privateKey.export({ type: "pkcs8", format: "pem" }),
  { mode: 0o600 },
);
writeFileSync(join(keysDir, "extension-id.txt"), extensionId + "\n");

console.log("✓ Stable extension identity generated.\n");
console.log("Extension ID:\n  " + extensionId + "\n");
console.log('Add to public/manifest.json:\n  "key": "' + keyField + '"\n');
console.log(
  "Private key saved to keys/extension-key.pem (git-ignored — keep it safe, do NOT commit).",
);
