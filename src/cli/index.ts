/**
 * coolify-11d CLI entry point.
 *
 * Scaffold — only a few commands wired for the smoke test. Full
 * commander subcommand tree lands in PR #5.
 */

import { Command } from "commander";
import { CoolifyApiClient } from "../core/api-client.js";
import { resolveConfig } from "../core/config.js";

const program = new Command();

program
  .name("coolify-11d")
  .description("CLI for self-hosted Coolify with the -11d naming convention")
  .version("0.1.0");

// ---- system ----
const system = program.command("system").description("System-level operations");

system
  .command("health")
  .description("GET /api/health — ping the Coolify instance")
  .action(async () => {
    const cfg = resolveConfig();
    const client = new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    const result = await client.health();
    console.log(result);
  });

system
  .command("version")
  .description("GET /api/v1/version — show Coolify version")
  .action(async () => {
    const cfg = resolveConfig();
    const client = new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    const result = await client.version();
    console.log(result);
  });

system
  .command("enable-api")
  .description("GET /api/v1/enable — enable API access")
  .action(async () => {
    const cfg = resolveConfig();
    const client = new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    await client.enableApi();
    console.log("API enabled.");
  });

// ---- init ----
program
  .command("init")
  .description("Interactive setup wizard (stub — full wizard lands in PR #5)")
  .action(() => {
    console.log("coolify-11d init — interactive wizard not yet implemented.");
    console.log("Set COOLIFY_BASE_URL and COOLIFY_TOKEN env vars for now.");
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
