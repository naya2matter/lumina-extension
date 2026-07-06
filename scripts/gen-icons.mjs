// Rasterize public/logo.svg into the PNG toolbar/action icons Chrome requires
// (SVG is not supported for MV3 action/icons). Run: npm run gen-icons
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svg = await readFile(join(publicDir, "logo.svg"));

const sizes = [16, 32, 48, 128];
await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(join(publicDir, `icon-${size}.png`))
      .then(() => console.log(`✓ icon-${size}.png`)),
  ),
);
console.log("Done — icons written to public/");
