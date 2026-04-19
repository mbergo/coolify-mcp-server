/**
 * `coolify-11d config` subcommand — manage persistent store.
 */

import type { Command } from "commander";
import {
  type ConfigSource,
  clearConfig,
  configFilePath,
  getConfigValue,
  getStore,
  setConfigValue,
} from "../../core/config.js";
import { confirm } from "../prompt.js";

const VALID_KEYS: (keyof ConfigSource)[] = [
  "base_url",
  "token",
  "naming_suffix",
  "naming_collision",
  "output_format",
  "verbosity",
  "default_server_uuid",
  "default_project_uuid",
];

function assertKey(key: string): asserts key is keyof ConfigSource {
  if (!VALID_KEYS.includes(key as keyof ConfigSource)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
  }
}

function redactIfSecret(key: string, value: unknown): string {
  if (value === undefined || value === null) return "(unset)";
  if (key === "token" && typeof value === "string" && value.length > 0) {
    return "***";
  }
  return String(value);
}

export function registerConfigCommand(program: Command): void {
  const cfg = program
    .command("config")
    .description("Manage persistent configuration (~/.config/coolify-11d)");

  cfg
    .command("set <key> <value>")
    .description(`Set a config key. Valid: ${VALID_KEYS.join(" | ")}`)
    .action((key: string, value: string) => {
      assertKey(key);
      // biome-ignore lint/suspicious/noExplicitAny: key is validated
      setConfigValue(key, value as any);
      console.log(`Set ${key} → ${redactIfSecret(key, value)}`);
    });

  cfg
    .command("get <key>")
    .description("Read a single config key")
    .action((key: string) => {
      assertKey(key);
      const v = getConfigValue(key);
      console.log(redactIfSecret(key, v));
    });

  cfg
    .command("unset <key>")
    .description("Remove a config key")
    .action((key: string) => {
      assertKey(key);
      getStore().delete(key as string);
      console.log(`Unset ${key}`);
    });

  cfg
    .command("list")
    .description("List all config values (token redacted)")
    .action(() => {
      const store = getStore();
      const entries: Record<string, string> = {};
      for (const k of VALID_KEYS) {
        entries[k] = redactIfSecret(k, store.get(k));
      }
      console.log(JSON.stringify(entries, null, 2));
    });

  cfg
    .command("path")
    .description("Print the config file path")
    .action(() => {
      console.log(configFilePath());
    });

  cfg
    .command("clear")
    .description("Delete all stored configuration")
    .option("-y, --yes", "Skip confirmation")
    .action(async (opts: { yes?: boolean }) => {
      const ok = await confirm({
        message: `Wipe ${configFilePath()}?`,
        default: false,
        assumeYes: opts.yes,
      });
      if (!ok) {
        console.log("Aborted.");
        return;
      }
      clearConfig();
      console.log("Cleared.");
    });
}
