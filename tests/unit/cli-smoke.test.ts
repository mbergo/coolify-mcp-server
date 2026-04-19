import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Smoke tests that the built CLI loads + exposes the full command tree.
// Require `npm run build` to have produced dist/cli.js.

const DIST = "dist/cli.js";

describe("CLI smoke (requires prior build)", () => {
  const skip = !existsSync(DIST);

  it.skipIf(skip)("--version prints", () => {
    const out = execSync(`node ${DIST} --version`).toString().trim();
    expect(out).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.skipIf(skip)("--help lists every top-level subcommand", () => {
    const out = execSync(`node ${DIST} --help`).toString();
    for (const cmd of [
      "init",
      "config",
      "system",
      "apps",
      "db",
      "svc",
      "deploy",
      "server",
      "project",
      "search",
    ]) {
      expect(out).toContain(cmd);
    }
  });

  it.skipIf(skip)("apps subcommand exposes create + delete + update", () => {
    const out = execSync(`node ${DIST} apps --help`).toString();
    expect(out).toContain("create-public");
    expect(out).toContain("create-dockerfile");
    expect(out).toContain("create-image");
    expect(out).toContain("create-compose");
    expect(out).toContain("delete");
    expect(out).toContain("update");
  });

  it.skipIf(skip)("db create exposes every engine", () => {
    const out = execSync(`node ${DIST} db create --help`).toString();
    for (const e of [
      "postgres",
      "mysql",
      "mariadb",
      "mongodb",
      "redis",
      "clickhouse",
      "dragonfly",
      "keydb",
    ]) {
      expect(out).toContain(e);
    }
  });

  it.skipIf(skip)("config subcommand tree", () => {
    const out = execSync(`node ${DIST} config --help`).toString();
    for (const s of ["set", "get", "unset", "list", "path", "clear"]) {
      expect(out).toContain(s);
    }
  });
});
