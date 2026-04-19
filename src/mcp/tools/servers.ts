import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getServer, listServers } from "../../core/compact.js";
import { resolveConfig } from "../../core/config.js";
import { createServer as createServerWithNaming } from "../../core/create-with-naming.js";
import type { Verbosity } from "../../core/types.js";
import {
  confirmSchema,
  getClient,
  jsonContent,
  requireConfirm,
  textContent,
  verbositySchema,
} from "../helpers.js";

export function registerServerTools(server: McpServer): void {
  server.registerTool(
    "list_servers",
    {
      title: "List servers",
      description: "List all Coolify servers.",
      inputSchema: { verbosity: verbositySchema },
    },
    async (args: { verbosity?: Verbosity }) =>
      jsonContent(await listServers(getClient(), { verbosity: args.verbosity })),
  );

  server.registerTool(
    "get_server",
    {
      title: "Get server",
      description: "Fetch a single server by UUID.",
      inputSchema: { uuid: z.string(), verbosity: verbositySchema },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getServer(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  server.registerTool(
    "create_server",
    {
      title: "Create server",
      description: "Register a new server; renames to <name>-11d post-create.",
      inputSchema: {
        name: z.string(),
        ip: z.string(),
        port: z.number().int().optional(),
        user: z.string().optional(),
        private_key_uuid: z.string(),
        description: z.string().optional(),
        is_build_server: z.boolean().optional(),
        instant_validate: z.boolean().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createServerWithNaming(
        getClient(),
        {
          name: args.name,
          ip: args.ip,
          port: args.port,
          user: args.user,
          private_key_uuid: args.private_key_uuid,
          description: args.description,
          is_build_server: args.is_build_server,
          instant_validate: args.instant_validate,
        },
        { policy: cfg.namingCollision, suffix: cfg.namingSuffix },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "delete_server",
    {
      title: "Delete server",
      description: "Permanently delete a server. Requires confirm:true.",
      inputSchema: { uuid: z.string(), confirm: confirmSchema },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_server");
      await getClient().server.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  server.registerTool(
    "update_server",
    {
      title: "Update server",
      description: "PATCH server fields.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().server.update(args.uuid, args.patch)),
  );

  server.registerTool(
    "server_resources",
    {
      title: "Server resources",
      description: "List applications, databases, and services attached to a server.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().server.resources(args.uuid)),
  );

  server.registerTool(
    "server_domains",
    {
      title: "Server domains",
      description: "List domains in use on a server.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().server.domains(args.uuid)),
  );

  server.registerTool(
    "validate_server",
    {
      title: "Validate server",
      description: "Run server connectivity + setup validation.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().server.validate(args.uuid)),
  );
}
