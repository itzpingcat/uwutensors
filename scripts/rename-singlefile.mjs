// vite-plugin-singlefile always emits dist/index.html. Keep that conventional
// filename as well as the project's UwUTensors.html distribution name.
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const src = join(dist, "index.html");
const dest = join(dist, "UwUTensors.html");

if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log(`Wrote ${dest}`);
} else {
  console.error(`Expected ${src} to exist after build`);
  process.exit(1);
}

// Clean up any leftover empty asset dirs from the non-inlined build (favicon etc).
const assetsDir = join(dist, "assets");
if (existsSync(assetsDir)) {
  try {
    rmSync(assetsDir, { recursive: true });
  } catch {
    // non-fatal
  }
}
