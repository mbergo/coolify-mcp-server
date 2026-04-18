import { defineConfig } from "tsup";

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
  },
]);
