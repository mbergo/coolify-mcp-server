import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CoolifyApiClient } from "../../core/api-client.js";
import { getDatabase, listDatabases } from "../../core/compact.js";
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
import type { CreateDatabaseBase, Verbosity } from "../../core/types.js";
import {
  confirmSchema,
  getClient,
  jsonContent,
  requireConfirm,
  textContent,
  verbositySchema,
} from "../helpers.js";

const ENGINES = {
  postgres: createPostgres,
  mysql: createMysql,
  mariadb: createMariadb,
  mongodb: createMongodb,
  redis: createRedis,
  clickhouse: createClickhouse,
  dragonfly: createDragonfly,
  keydb: createKeydb,
} as const;

type EngineName = keyof typeof ENGINES;

export function registerDatabaseTools(server: McpServer): void {
  server.registerTool(
    "list_databases",
    {
      title: "List databases",
      description: "List all databases.",
      inputSchema: { verbosity: verbositySchema },
    },
    async (args: { verbosity?: Verbosity }) =>
      jsonContent(await listDatabases(getClient(), { verbosity: args.verbosity })),
  );

  server.registerTool(
    "get_database",
    {
      title: "Get database",
      description: "Fetch a single database by UUID.",
      inputSchema: { uuid: z.string(), verbosity: verbositySchema },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getDatabase(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  for (const action of ["start", "stop", "restart"] as const) {
    server.registerTool(
      `${action}_database`,
      {
        title: `${action[0]?.toUpperCase()}${action.slice(1)} database`,
        description: `${action} a database by UUID.`,
        inputSchema: { uuid: z.string() },
      },
      async (args: { uuid: string }) => {
        await getClient().db[action](args.uuid);
        return textContent(`${action}ed ${args.uuid}`);
      },
    );
  }

  server.registerTool(
    "delete_database",
    {
      title: "Delete database",
      description: "Permanently delete a database. Requires confirm:true.",
      inputSchema: { uuid: z.string(), confirm: confirmSchema },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_database");
      await getClient().db.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  server.registerTool(
    "update_database",
    {
      title: "Update database",
      description: "PATCH database fields.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().db.update(args.uuid, args.patch)),
  );

  // ---- Create per engine ----

  const baseCreate = {
    server_uuid: z.string(),
    project_uuid: z.string(),
    environment_name: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    is_public: z.boolean().optional(),
    public_port: z.number().int().optional(),
    instant_deploy: z.boolean().optional(),
  } as const;

  for (const engine of Object.keys(ENGINES) as EngineName[]) {
    server.registerTool(
      `create_${engine}_database`,
      {
        title: `Create ${engine} database`,
        description: `Creates a ${engine} database and renames to <name>-11d post-create.`,
        inputSchema: baseCreate,
      },
      async (args) => {
        const cfg = resolveConfig();
        const fn = ENGINES[engine] as (
          c: CoolifyApiClient,
          input: CreateDatabaseBase & Record<string, unknown>,
          opts: {
            name?: string;
            fallbackBase: string;
            policy: ReturnType<typeof resolveConfig>["namingCollision"];
            suffix: string;
          },
        ) => Promise<{ create: { uuid: string }; finalName: string; collided: boolean }>;
        const result = await fn(
          getClient(),
          {
            server_uuid: args.server_uuid,
            project_uuid: args.project_uuid,
            environment_name: args.environment_name,
            name: args.name,
            description: args.description,
            image: args.image,
            is_public: args.is_public,
            public_port: args.public_port,
            instant_deploy: args.instant_deploy,
          },
          {
            name: args.name,
            fallbackBase: args.name ?? engine,
            policy: cfg.namingCollision,
            suffix: cfg.namingSuffix,
          },
        );
        return jsonContent({ engine, ...result });
      },
    );
  }

  // ---- Backups ----

  server.registerTool(
    "list_db_backups",
    {
      title: "List DB backups",
      description: "List backups for a database.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().db.backupsList(args.uuid)),
  );

  server.registerTool(
    "create_db_backup",
    {
      title: "Create DB backup",
      description: "Trigger/configure a new backup.",
      inputSchema: {
        uuid: z.string(),
        payload: z.record(z.string(), z.unknown()).default({}),
      },
    },
    async (args: { uuid: string; payload: Record<string, unknown> }) =>
      jsonContent(await getClient().db.backupCreate(args.uuid, args.payload)),
  );

  server.registerTool(
    "update_db_backup",
    {
      title: "Update DB backup config",
      description: "PATCH backup settings for a database.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().db.backupUpdate(args.uuid, args.patch)),
  );

  server.registerTool(
    "delete_db_backup",
    {
      title: "Delete DB backup",
      description: "Remove a backup. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        backup_uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; backup_uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_db_backup");
      await getClient().db.backupDelete(args.uuid, args.backup_uuid);
      return textContent(`Deleted backup ${args.backup_uuid}`);
    },
  );

  server.registerTool(
    "list_backup_execs",
    {
      title: "List backup executions",
      description: "List execution history for a database's backups.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().db.backupExecutions(args.uuid)),
  );

  server.registerTool(
    "delete_backup_exec",
    {
      title: "Delete backup execution",
      description: "Remove a backup execution record. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        exec_uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; exec_uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_backup_exec");
      await getClient().db.backupExecutionDelete(args.uuid, args.exec_uuid);
      return textContent(`Deleted backup exec ${args.exec_uuid}`);
    },
  );
}
