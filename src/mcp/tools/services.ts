import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getService, listServices } from "../../core/compact.js";
import { resolveConfig } from "../../core/config.js";
import { createService } from "../../core/create-with-naming.js";
import type { Verbosity } from "../../core/types.js";
import {
  confirmSchema,
  getClient,
  jsonContent,
  requireConfirm,
  textContent,
  verbositySchema,
} from "../helpers.js";

const envVarSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  is_preview: z.boolean().optional(),
  is_build_time: z.boolean().optional(),
  is_literal: z.boolean().optional(),
  is_multiline: z.boolean().optional(),
  is_shown_once: z.boolean().optional(),
});

export function registerServiceTools(server: McpServer): void {
  server.registerTool(
    "list_services",
    {
      title: "List services",
      description: "List all services.",
      inputSchema: { verbosity: verbositySchema },
    },
    async (args: { verbosity?: Verbosity }) =>
      jsonContent(await listServices(getClient(), { verbosity: args.verbosity })),
  );

  server.registerTool(
    "get_service",
    {
      title: "Get service",
      description: "Fetch a single service by UUID.",
      inputSchema: { uuid: z.string(), verbosity: verbositySchema },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getService(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  server.registerTool(
    "create_service",
    {
      title: "Create service",
      description: "Create a service (plausible, n8n, outline, etc.) and apply -11d naming.",
      inputSchema: {
        server_uuid: z.string(),
        project_uuid: z.string(),
        environment_name: z.string().optional(),
        type: z.string().describe("Service type, e.g. 'plausible', 'n8n', 'outline'"),
        name: z.string().optional(),
        description: z.string().optional(),
        instant_deploy: z.boolean().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createService(
        getClient(),
        {
          server_uuid: args.server_uuid,
          project_uuid: args.project_uuid,
          environment_name: args.environment_name,
          type: args.type,
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? args.type,
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "delete_service",
    {
      title: "Delete service",
      description: "Permanently delete a service. Requires confirm:true.",
      inputSchema: { uuid: z.string(), confirm: confirmSchema },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_service");
      await getClient().svc.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  server.registerTool(
    "update_service",
    {
      title: "Update service",
      description: "PATCH service fields.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().svc.update(args.uuid, args.patch)),
  );

  for (const action of ["start", "stop", "restart"] as const) {
    server.registerTool(
      `${action}_service`,
      {
        title: `${action[0]?.toUpperCase()}${action.slice(1)} service`,
        description: `${action} a service by UUID.`,
        inputSchema: { uuid: z.string() },
      },
      async (args: { uuid: string }) => {
        await getClient().svc[action](args.uuid);
        return textContent(`${action}ed ${args.uuid}`);
      },
    );
  }

  // ---- Service env vars ----

  server.registerTool(
    "list_svc_envs",
    {
      title: "List service env vars",
      description: "Environment variables for a service (values redacted by default).",
      inputSchema: { uuid: z.string(), verbosity: verbositySchema },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) => {
      const envs = await getClient().svc.envs(args.uuid);
      const reveal = args.verbosity === "full";
      return jsonContent(
        envs.map((e) => (reveal ? e : { ...e, value: e.value ? "***" : e.value })),
      );
    },
  );

  server.registerTool(
    "create_svc_env",
    {
      title: "Create service env var",
      inputSchema: { uuid: z.string(), env: envVarSchema },
    },
    async (args: { uuid: string; env: unknown }) =>
      jsonContent(await getClient().svc.createEnv(args.uuid, args.env as never)),
  );

  server.registerTool(
    "update_svc_env",
    {
      title: "Update service env var",
      inputSchema: { uuid: z.string(), env: envVarSchema },
    },
    async (args: { uuid: string; env: unknown }) =>
      jsonContent(await getClient().svc.updateEnv(args.uuid, args.env as never)),
  );

  server.registerTool(
    "bulk_update_svc_envs",
    {
      title: "Bulk update service env vars",
      inputSchema: { uuid: z.string(), envs: z.array(envVarSchema) },
    },
    async (args: { uuid: string; envs: unknown[] }) =>
      jsonContent(await getClient().svc.bulkUpdateEnv(args.uuid, args.envs as never)),
  );

  server.registerTool(
    "delete_svc_env",
    {
      title: "Delete service env var",
      description: "Remove a single service env var. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        env_uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; env_uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_svc_env");
      await getClient().svc.deleteEnv(args.uuid, args.env_uuid);
      return textContent(`Deleted env ${args.env_uuid}`);
    },
  );
}
