import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProject, listProjects } from "../../core/compact.js";
import { resolveConfig } from "../../core/config.js";
import { createProject } from "../../core/create-with-naming.js";
import type { Verbosity } from "../../core/types.js";
import {
  confirmSchema,
  getClient,
  jsonContent,
  requireConfirm,
  textContent,
  verbositySchema,
} from "../helpers.js";

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List all projects.",
      inputSchema: { verbosity: verbositySchema },
    },
    async (args: { verbosity?: Verbosity }) =>
      jsonContent(await listProjects(getClient(), { verbosity: args.verbosity })),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "Fetch a single project by UUID.",
      inputSchema: { uuid: z.string(), verbosity: verbositySchema },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getProject(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Create a project; renames to <name>-11d post-create.",
      inputSchema: {
        name: z.string(),
        description: z.string().optional(),
      },
    },
    async (args: { name: string; description?: string }) => {
      const cfg = resolveConfig();
      const result = await createProject(
        getClient(),
        { name: args.name, description: args.description },
        { policy: cfg.namingCollision, suffix: cfg.namingSuffix },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete project",
      description: "Permanently delete a project. Requires confirm:true.",
      inputSchema: { uuid: z.string(), confirm: confirmSchema },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_project");
      await getClient().project.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  server.registerTool(
    "update_project",
    {
      title: "Update project",
      description: "PATCH project fields.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().project.update(args.uuid, args.patch)),
  );

  // ---- Environments ----

  server.registerTool(
    "list_project_envs",
    {
      title: "List project environments",
      description: "Environments defined under a project.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) =>
      jsonContent(await getClient().project.environments(args.uuid)),
  );

  server.registerTool(
    "get_project_env",
    {
      title: "Get project environment",
      description: "Fetch a single environment under a project.",
      inputSchema: {
        uuid: z.string().describe("Project UUID"),
        env_name: z.string(),
      },
    },
    async (args: { uuid: string; env_name: string }) =>
      jsonContent(await getClient().project.getEnvironment(args.uuid, args.env_name)),
  );

  server.registerTool(
    "create_project_env",
    {
      title: "Create project environment",
      description: "Add a new environment to a project.",
      inputSchema: {
        uuid: z.string().describe("Project UUID"),
        name: z.string().describe("Environment name"),
      },
    },
    async (args: { uuid: string; name: string }) =>
      jsonContent(await getClient().project.createEnvironment(args.uuid, args.name)),
  );

  server.registerTool(
    "delete_project_env",
    {
      title: "Delete project environment",
      description: "Remove an environment from a project. Requires confirm:true.",
      inputSchema: {
        uuid: z.string().describe("Project UUID"),
        env_name: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; env_name: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_project_env");
      await getClient().project.deleteEnvironment(args.uuid, args.env_name);
      return textContent(`Deleted environment ${args.env_name}`);
    },
  );
}
