import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist", import.meta.url), { recursive: true });
await build({
  entryPoints: {
    content: "src/content/index.ts",
    "service-worker": "src/background/service-worker.ts",
    popup: "src/popup/popup.ts",
    options: "src/options/options.ts"
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  minify: false
});
await build({
  entryPoints: {
    "claude-bridge": "src/injected/claude-usage-bridge.ts",
    "chatgpt-bridge": "src/injected/chatgpt-usage-bridge.ts"
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  minify: false
});
await Promise.all([
  cp("manifest.json", "dist/manifest.json"),
  cp("src/popup/popup.html", "dist/popup.html"),
  cp("src/popup/popup.css", "dist/popup.css"),
  cp("src/options/options.html", "dist/options.html"),
  cp("src/options/options.css", "dist/options.css"),
  cp("icons", "dist/icons", { recursive: true })
]);
