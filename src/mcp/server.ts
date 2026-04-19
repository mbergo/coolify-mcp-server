/**
 * coolify-11d MCP server (stdio transport).
 *
 * PR #4: adds P0 read tools (list_*, get_*) that return optimizer-backed
 * compact responses by default. Full tool registry (~90 tools + composites)
 * lands in PR #6/#7.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CoolifyApiClient } from "../core/api-client.js";
import {
  getApplication,
  getDatabase,
  getDeployment,
  getProject,
  getServer,
  getService,
  listApplications,
  listDatabases,
  listDeployments,
  listProjects,
  listServers,
  listServices,
} from "../core/compact.js";
import { resolveConfig } from "../core/config.js";
import { searchResources } from "../core/search.js";
import type { Verbosity } from "../core/types.js";

// ----------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------

function getClient(): CoolifyApiClient {
  const cfg = resolveConfig();
  return new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
}

function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function textContent(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

const verbositySchema = z
  .enum(["compact", "standard", "full"])
  .default("compact")
  .describe("Response detail level; defaults to compact to preserve context window.");

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------

async function main(): Promise<void> {
  const server = new McpServer({ name: "coolify-11d", version: "0.1.0" });

  // ---- System ----

  server.registerTool(
    "system_health",
    {
      title: "System health",
      description: "Ping the configured Coolify instance (/api/health).",
      inputSchema: {},
    },
    async () => textContent(await getClient().health()),
  );

  server.registerTool(
    "system_version",
    {
      title: "Coolify version",
      description: "Return the Coolify instance version.",
      inputSchema: {},
    },
    async () => textContent(await getClient().version()),
  );

  // ---- Applications ----

  server.registerTool(
    "list_applications",
    {
      title: "List applications",
      description:
        "List all applications. Returns compact summaries by default. Filter by server_uuid or project_uuid.",
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
        uuid: z.string().describe("Application UUID"),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getApplication(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  for (const action of ["start", "stop", "restart"] as const) {
    server.registerTool(
      `${action}_application`,
      {
        title: `${action[0]?.toUpperCase() ?? ""}${action.slice(1)} application`,
        description: `${action} an application by UUID.`,
        inputSchema: {
          uuid: z.string().describe("Application UUID"),
        },
      },
      async (args: { uuid: string }) => {
        await getClient().apps[action](args.uuid);
        return textContent(`${action}ed ${args.uuid}`);
      },
    );
  }

  // ---- Databases ----

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
      inputSchema: {
        uuid: z.string().describe("Database UUID"),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getDatabase(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  // ---- Services ----

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
      inputSchema: {
        uuid: z.string().describe("Service UUID"),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getService(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  // ---- Deployments ----

  server.registerTool(
    "list_deployments",
    {
      title: "List deployments",
      description: "List recent deployments.",
      inputSchema: {
        verbosity: verbositySchema,
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: { verbosity?: Verbosity; limit?: number }) =>
      jsonContent(
        await listDeployments(getClient(), { verbosity: args.verbosity, limit: args.limit }),
      ),
  );

  server.registerTool(
    "get_deployment",
    {
      title: "Get deployment",
      description: "Fetch a single deployment by UUID.",
      inputSchema: {
        uuid: z.string(),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getDeployment(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  // ---- Servers ----

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
      inputSchema: {
        uuid: z.string(),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getServer(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  // ---- Projects ----

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
      inputSchema: {
        uuid: z.string(),
        verbosity: verbositySchema,
      },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getProject(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  // ---- Search ----

  server.registerTool(
    "search_resources",
    {
      title: "Search resources",
      description:
        "Smart search across applications, databases, services, servers, and projects. Matches UUID, exact name, domain/fqdn, server IP, or fuzzy name.",
      inputSchema: {
        query: z.string().min(1),
        kinds: z
          .array(z.enum(["application", "database", "service", "server", "project"]))
          .optional(),
        limit: z.number().int().positive().max(50).default(20),
        fuzzyThreshold: z.number().min(0).max(1).default(0.4),
      },
    },
    async (args: {
      query: string;
      kinds?: ("application" | "database" | "service" | "server" | "project")[];
      limit?: number;
      fuzzyThreshold?: number;
    }) =>
      jsonContent(
        await searchResources(getClient(), args.query, {
          kinds: args.kinds,
          limit: args.limit,
          fuzzyThreshold: args.fuzzyThreshold,
        }),
      ),
  );

  // ---- Connect transport ----

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("coolify-11d MCP server ready (stdio)\n");
}

main().catch((err: Error) => {
  process.stderr.write(`coolify-11d MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
