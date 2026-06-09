// Rasterize the Stay mark into the PNG sizes PWAs and iOS need.
// Run once after changing public/icon.svg:  pnpm --filter @timespent/web icons
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// Square-corner variant: iOS and maskable icons get masked by the OS.
const mark = (rx) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="#0E0D0B"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#F3EEE3" stroke-width="22"
          stroke-linecap="round" stroke-dasharray="800 142.48"
          transform="rotate(-58 256 256)"/>
  <circle cx="256" cy="256" r="58" fill="#E8B14E"/>
</svg>`;

const rounded = Buffer.from(mark(116));
const square = Buffer.from(mark(0));

await Promise.all([
  sharp(rounded).resize(192).png().toFile(path.join(pub, "pwa-192.png")),
  sharp(rounded).resize(512).png().toFile(path.join(pub, "pwa-512.png")),
  sharp(square).resize(512).png().toFile(path.join(pub, "pwa-maskable-512.png")),
  sharp(square).resize(180).png().toFile(path.join(pub, "apple-touch-icon.png")),
]);

console.log("Icons written to apps/web/public/");
