import { mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig } from "tsup";

function copyUiAsset(): void {
  const dest = "dist/connector/ui/index.html";
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync("src/connector/ui/index.html", dest);
  // eslint-disable-next-line no-console
  console.log("[tsup] copied setup UI → dist/connector/ui/index.html");
}

// Two builds: executables (shebang) and library (no shebang).
export default defineConfig([
  {
    name: "executables",
    entry: {
      cli: "src/cli/index.ts",
      mcp: "src/mcp/server.ts",
    },
    format: ["esm"],
    target: "node22",
    platform: "node",
    dts: false,
    sourcemap: true,
    clean: true,
    splitting: false,
    shims: false,
    banner: { js: "#!/usr/bin/env node" },
    external: ["keytar"],
  },
  {
    name: "library",
    entry: {
      index: "src/index.ts",
      "connector/server": "src/connector/server.ts",
    },
    format: ["esm"],
    target: "node22",
    platform: "node",
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    shims: false,
    external: ["keytar"],
    onSuccess: async () => {
      copyUiAsset();
    },
  },
]);
