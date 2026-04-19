import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApplication, listApplications } from "../../core/compact.js";
import { resolveConfig } from "../../core/config.js";
import {
  createDeployKeyApp,
  createDockerComposeApp,
  createDockerImageApp,
  createDockerfileApp,
  createGithubApp,
  createPublicApp,
} from "../../core/create-with-naming.js";
import type { BuildPack, Verbosity } from "../../core/types.js";
import {
  confirmSchema,
  getClient,
  jsonContent,
  requireConfirm,
  textContent,
  verbositySchema,
} from "../helpers.js";

const buildPackSchema = z.enum([
  "nixpacks",
  "static",
  "dockerfile",
  "dockercompose",
  "dockerimage",
]);

const envVarSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  is_preview: z.boolean().optional(),
  is_build_time: z.boolean().optional(),
  is_literal: z.boolean().optional(),
  is_multiline: z.boolean().optional(),
  is_shown_once: z.boolean().optional(),
});

export function registerAppsTools(server: McpServer): void {
  // ---- Read ----

  server.registerTool(
    "list_applications",
    {
      title: "List applications",
      description: "List applications. Compact by default. Filter by server_uuid or project_uuid.",
      inputSchema: {
        verbosity: verbositySchema,
        server_uuid: z.string().optional(),
        project_uuid: z.string().optional(),
      },
    },
    async (args: { verbosity?: Verbosity; server_uuid?: string; project_uuid?: string }) =>
      jsonContent(
        await listApplications(getClient(), {
          verbosity: args.verbosity,
          server_uuid: args.server_uuid,
          project_uuid: args.project_uuid,
        }),
      ),
  );

  server.registerTool(
    "get_application",
    {
      title: "Get application",
      description: "Fetch a single application by UUID.",
      inputSchema: {
        uuid: z.string(),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getApplication(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  // ---- Lifecycle ----

  for (const action of ["start", "stop", "restart"] as const) {
    server.registerTool(
      `${action}_application`,
      {
        title: `${action[0]?.toUpperCase()}${action.slice(1)} application`,
        description: `${action} an application by UUID.`,
        inputSchema: { uuid: z.string() },
      },
      async (args: { uuid: string }) => {
        await getClient().apps[action](args.uuid);
        return textContent(`${action}ed ${args.uuid}`);
      },
    );
  }

  // ---- Delete ----

  server.registerTool(
    "delete_application",
    {
      title: "Delete application",
      description: "Permanently delete an application. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_application");
      await getClient().apps.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  // ---- Update (arbitrary PATCH) ----

  server.registerTool(
    "update_application",
    {
      title: "Update application",
      description: "PATCH application fields. Pass a `patch` object with any Coolify fields.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) => {
      const result = await getClient().apps.update(args.uuid, args.patch);
      return jsonContent(result);
    },
  );

  // ---- Logs ----

  server.registerTool(
    "get_app_logs",
    {
      title: "Get application logs",
      description: "Fetch application log buffer.",
      inputSchema: {
        uuid: z.string(),
        lines: z.number().int().positive().max(10_000).optional(),
      },
    },
    async (args: { uuid: string; lines?: number }) =>
      jsonContent(await getClient().apps.logs(args.uuid, args.lines)),
  );

  // ---- Deployments ----

  server.registerTool(
    "list_app_deployments",
    {
      title: "List application deployments",
      description: "Recent deployments for a specific application.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().apps.deployments(args.uuid)),
  );

  // ---- Env vars ----

  server.registerTool(
    "list_app_envs",
    {
      title: "List application env vars",
      description: "Environment variables for an application (values redacted by default).",
      inputSchema: {
        uuid: z.string(),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) => {
      const envs = await getClient().apps.envs(args.uuid);
      const reveal = args.verbosity === "full";
      return jsonContent(
        envs.map((e) => (reveal ? e : { ...e, value: e.value ? "***" : e.value })),
      );
    },
  );

  server.registerTool(
    "create_app_env",
    {
      title: "Create application env var",
      description: "Add a new environment variable to an application.",
      inputSchema: {
        uuid: z.string(),
        env: envVarSchema,
      },
    },
    async (args: { uuid: string; env: unknown }) =>
      jsonContent(await getClient().apps.createEnv(args.uuid, args.env as never)),
  );

  server.registerTool(
    "update_app_env",
    {
      title: "Update application env var",
      description: "Update a single application env var.",
      inputSchema: {
        uuid: z.string(),
        env: envVarSchema,
      },
    },
    async (args: { uuid: string; env: unknown }) =>
      jsonContent(await getClient().apps.updateEnv(args.uuid, args.env as never)),
  );

  server.registerTool(
    "bulk_update_app_envs",
    {
      title: "Bulk update application env vars",
      description: "Replace / upsert several env vars in one PATCH.",
      inputSchema: {
        uuid: z.string(),
        envs: z.array(envVarSchema),
      },
    },
    async (args: { uuid: string; envs: unknown[] }) =>
      jsonContent(await getClient().apps.bulkUpdateEnv(args.uuid, args.envs as never)),
  );

  server.registerTool(
    "delete_app_env",
    {
      title: "Delete application env var",
      description: "Remove a single env var by UUID. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        env_uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; env_uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_app_env");
      await getClient().apps.deleteEnv(args.uuid, args.env_uuid);
      return textContent(`Deleted env ${args.env_uuid}`);
    },
  );

  // ---- Create flavours (all go through createWithNaming) ----

  const baseCreate = {
    project_uuid: z.string(),
    server_uuid: z.string(),
    environment_name: z.string().optional(),
    name: z.string().optional().describe("Descriptive base name (auto-suffixed with -11d)"),
    description: z.string().optional(),
    instant_deploy: z.boolean().optional(),
  } as const;

  server.registerTool(
    "create_public_app",
    {
      title: "Create application (public git)",
      description: "Creates an app from a public repository; renames to <name>-11d post-create.",
      inputSchema: {
        ...baseCreate,
        git_repository: z.string(),
        git_branch: z.string().default("main"),
        build_pack: buildPackSchema.default("nixpacks"),
        ports_exposes: z.string().optional(),
        domains: z.string().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createPublicApp(
        getClient(),
        {
          project_uuid: args.project_uuid,
          server_uuid: args.server_uuid,
          environment_name: args.environment_name,
          git_repository: args.git_repository,
          git_branch: args.git_branch ?? "main",
          build_pack: (args.build_pack ?? "nixpacks") as BuildPack,
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
          ports_exposes: args.ports_exposes,
          domains: args.domains,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? "app",
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "create_github_app",
    {
      title: "Create application (private via GitHub App)",
      description: "Creates an app using a GitHub App installation for repo auth.",
      inputSchema: {
        ...baseCreate,
        github_app_uuid: z.string(),
        git_repository: z.string(),
        git_branch: z.string().default("main"),
        build_pack: buildPackSchema.default("nixpacks"),
        ports_exposes: z.string().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createGithubApp(
        getClient(),
        {
          project_uuid: args.project_uuid,
          server_uuid: args.server_uuid,
          environment_name: args.environment_name,
          github_app_uuid: args.github_app_uuid,
          git_repository: args.git_repository,
          git_branch: args.git_branch ?? "main",
          build_pack: (args.build_pack ?? "nixpacks") as BuildPack,
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
          ports_exposes: args.ports_exposes,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? "app",
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "create_deploy_key_app",
    {
      title: "Create application (private via deploy key)",
      description: "Creates an app using a stored deploy key for repo auth.",
      inputSchema: {
        ...baseCreate,
        private_key_uuid: z.string(),
        git_repository: z.string(),
        git_branch: z.string().default("main"),
        build_pack: buildPackSchema.default("nixpacks"),
        ports_exposes: z.string().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createDeployKeyApp(
        getClient(),
        {
          project_uuid: args.project_uuid,
          server_uuid: args.server_uuid,
          environment_name: args.environment_name,
          private_key_uuid: args.private_key_uuid,
          git_repository: args.git_repository,
          git_branch: args.git_branch ?? "main",
          build_pack: (args.build_pack ?? "nixpacks") as BuildPack,
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
          ports_exposes: args.ports_exposes,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? "app",
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "create_dockerfile_app",
    {
      title: "Create application (from Dockerfile)",
      description: "Creates an app from inline Dockerfile contents.",
      inputSchema: {
        ...baseCreate,
        dockerfile: z.string().describe("Dockerfile contents"),
        ports_exposes: z.string().optional(),
        domains: z.string().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createDockerfileApp(
        getClient(),
        {
          project_uuid: args.project_uuid,
          server_uuid: args.server_uuid,
          environment_name: args.environment_name,
          dockerfile: args.dockerfile,
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
          ports_exposes: args.ports_exposes,
          domains: args.domains,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? "app",
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "create_dockerimage_app",
    {
      title: "Create application (from Docker image)",
      description: "Creates an app from a Docker registry image.",
      inputSchema: {
        ...baseCreate,
        docker_registry_image_name: z.string(),
        docker_registry_image_tag: z.string().default("latest"),
        ports_exposes: z.string().optional(),
        domains: z.string().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createDockerImageApp(
        getClient(),
        {
          project_uuid: args.project_uuid,
          server_uuid: args.server_uuid,
          environment_name: args.environment_name,
          docker_registry_image_name: args.docker_registry_image_name,
          docker_registry_image_tag: args.docker_registry_image_tag ?? "latest",
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
          ports_exposes: args.ports_exposes,
          domains: args.domains,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? "app",
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "create_compose_app",
    {
      title: "Create application (from docker-compose)",
      description: "Creates an app from inline docker-compose YAML contents.",
      inputSchema: {
        ...baseCreate,
        docker_compose_raw: z.string().describe("docker-compose YAML"),
        domains: z.string().optional(),
      },
    },
    async (args) => {
      const cfg = resolveConfig();
      const result = await createDockerComposeApp(
        getClient(),
        {
          project_uuid: args.project_uuid,
          server_uuid: args.server_uuid,
          environment_name: args.environment_name,
          docker_compose_raw: args.docker_compose_raw,
          name: args.name,
          description: args.description,
          instant_deploy: args.instant_deploy,
          domains: args.domains,
        },
        {
          name: args.name,
          fallbackBase: args.name ?? "app",
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        },
      );
      return jsonContent(result);
    },
  );
}
