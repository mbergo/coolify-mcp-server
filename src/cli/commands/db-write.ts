/**
 * `coolify-11d db create <engine>` + update/delete.
 */

import type { Command } from "commander";
import type { CoolifyApiClient } from "../../core/api-client.js";
import { resolveConfig } from "../../core/config.js";
import {
  createClickhouse,
  createDragonfly,
  createKeydb,
  createMariadb,
  createMongodb,
  createMysql,
  createPostgres,
  createRedis,
} from "../../core/create-with-naming.js";
import type { CreateDatabaseBase } from "../../core/types.js";
import { confirmDestructive } from "../prompt.js";

type EngineFn = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: {
    name?: string;
    fallbackBase: string;
    policy: ReturnType<typeof resolveConfig>["namingCollision"];
    suffix: string;
  },
) => Promise<{ create: { uuid: string }; finalName: string; collided: boolean }>;

const ENGINES: Record<string, EngineFn> = {
  postgres: createPostgres,
  postgresql: createPostgres,
  mysql: createMysql,
  mariadb: createMariadb,
  mongodb: createMongodb,
  redis: createRedis,
  clickhouse: createClickhouse,
  dragonfly: createDragonfly,
  keydb: createKeydb,
};

export function registerDbWriteCommands(db: Command, getClient: () => CoolifyApiClient): void {
  const create = db.command("create").description("Create a database");

  for (const engine of Object.keys(ENGINES)) {
    create
      .command(engine)
      .description(`Create a ${engine} database`)
      .requiredOption("--server <uuid>")
      .requiredOption("--project <uuid>")
      .option("--name <name>")
      .option("--environment <name>")
      .option("--image <image>", "Custom Docker image")
      .option("--public", "Expose publicly")
      .option("--public-port <port>", "Public port", Number)
      .option("--instant-deploy")
      .action(
        async (opts: {
          server: string;
          project: string;
          name?: string;
          environment?: string;
          image?: string;
          public?: boolean;
          publicPort?: number;
          instantDeploy?: boolean;
        }) => {
          const cfg = resolveConfig();
          const fn = ENGINES[engine];
          if (!fn) throw new Error(`Unknown engine: ${engine}`);
          const input: CreateDatabaseBase & Record<string, unknown> = {
            server_uuid: opts.server,
            project_uuid: opts.project,
            environment_name: opts.environment,
            name: opts.name,
            image: opts.image,
            is_public: opts.public,
            public_port: opts.publicPort,
            instant_deploy: opts.instantDeploy,
          };
          const result = await fn(getClient(), input, {
            name: opts.name,
            fallbackBase: opts.name ?? engine,
            policy: cfg.namingCollision,
            suffix: cfg.namingSuffix,
          });
          console.log(
            JSON.stringify(
              {
                uuid: result.create.uuid,
                name: result.finalName,
                engine,
                collided: result.collided,
              },
              null,
              2,
            ),
          );
        },
      );
  }

  db.command("delete <uuid>")
    .description("Delete a database")
    .option("-y, --yes", "Skip confirmation")
    .action(async (uuid: string, opts: { yes?: boolean }) => {
      await confirmDestructive("delete database", uuid, Boolean(opts.yes));
      await getClient().db.delete(uuid);
      console.log(`Deleted ${uuid}`);
    });

  db.command("update <uuid>")
    .description("Update a database")
    .option("--field <key=value...>", "Field updates (repeatable)")
    .action(async (uuid: string, opts: { field?: string[] }) => {
      const patch = parseFields(opts.field ?? []);
      if (Object.keys(patch).length === 0) {
        throw new Error("No fields provided. Use --field key=value (can repeat).");
      }
      await getClient().db.update(uuid, patch);
      console.log(`Updated ${uuid}: ${JSON.stringify(patch)}`);
    });
}

function parseFields(fields: string[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const idx = f.indexOf("=");
    if (idx < 0) throw new Error(`Malformed --field "${f}". Use key=value.`);
    const key = f.slice(0, idx);
    const rawVal = f.slice(idx + 1);
    if (rawVal === "true") out[key] = true;
    else if (rawVal === "false") out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(rawVal)) out[key] = Number(rawVal);
    else out[key] = rawVal;
  }
  return out;
}
