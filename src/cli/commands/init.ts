/**
 * `coolify-11d init` — interactive setup wizard.
 *
 * Steps:
 *   1. Collect baseUrl + token (with validation)
 *   2. Ping /api/health
 *   3. Hit /api/v1/version to confirm auth
 *   4. Probe token scope
 *   5. Optionally persist to ~/.config/coolify-11d/config.json
 */

import { CoolifyApiClient } from "../../core/api-client.js";
import { probeTokenScope } from "../../core/auth.js";
import { configFilePath, setConfigValue } from "../../core/config.js";
import type { NamingCollisionPolicy } from "../../core/types.js";
import { confirm, input, password, select } from "../prompt.js";

export async function runInit(): Promise<void> {
  console.log("coolify-11d — interactive setup\n");

  const baseUrl = await input({
    message: "Coolify base URL",
    default: process.env.COOLIFY_BASE_URL ?? "https://xyz.v3ct0r.one",
    required: true,
    validate: (v) => {
      if (!/^https?:\/\//.test(v)) return "Must start with http:// or https://";
      return true;
    },
  });

  const token = await password({
    message: "Coolify API token (Laravel Sanctum <id>|<hash>)",
  });
  if (!token) throw new Error("Token required");

  const client = new CoolifyApiClient({ baseUrl, token });

  // Probe
  console.log("\nTesting connection...");
  try {
    const health = await client.health();
    console.log(`  /api/health        → ${health}`);
  } catch (err) {
    console.error(`  /api/health        → FAIL (${(err as Error).message})`);
    throw new Error("Health check failed. Is the URL correct?");
  }

  try {
    const version = await client.version();
    console.log(`  /api/v1/version    → ${version}`);
  } catch (err) {
    console.error(`  /api/v1/version    → FAIL (${(err as Error).message})`);
    console.error("Token may lack API access. Enable API via Coolify UI → Keys & Tokens.");
    throw err;
  }

  const probe = await probeTokenScope(client);
  console.log(`  detected scope     → ${probe.scope}`);
  if (probe.notes.length > 0) {
    for (const n of probe.notes) console.log(`  note: ${n}`);
  }

  // Collision policy
  const policy = await select<NamingCollisionPolicy>({
    message: "Naming collision policy (when <name>-11d already exists)",
    default: "increment",
    choices: [
      { name: "increment  (auto-number -01..-40)", value: "increment" },
      { name: "error      (throw, let caller handle)", value: "error" },
      { name: "prompt     (ask interactively)", value: "prompt" },
    ],
  });

  const persist = await confirm({
    message: `Save config to ${configFilePath()}?`,
    default: true,
  });

  if (persist) {
    setConfigValue("base_url", baseUrl);
    setConfigValue("token", token);
    setConfigValue("naming_collision", policy);
    setConfigValue("naming_suffix", "11d");
    console.log(`\nSaved to ${configFilePath()}`);
  } else {
    console.log("\nSkipped saving. Export COOLIFY_BASE_URL + COOLIFY_TOKEN to use the CLI.");
  }

  console.log("\nReady. Try: coolify-11d apps list");
}
