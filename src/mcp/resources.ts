/**
 * MCP resource endpoints — `coolify://<kind>/<uuid>` URIs for browsing.
 *
 * Compact by default; clients that want full fidelity call the matching
 * `get_*` tool with verbosity="full" instead.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getApplication,
  getDatabase,
  getProject,
  getServer,
  getService,
  listApplications,
  listDatabases,
  listProjects,
  listServers,
  listServices,
} from "../core/compact.js";
import { getClient } from "./helpers.js";

function jsonText(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function textText(uri: string, value: string) {
  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: value,
      },
    ],
  };
}

export function registerResources(server: McpServer): void {
  // ---- Static listings ----

  server.registerResource(
    "applications",
    "coolify://applications",
    {
      title: "Applications",
      description: "List all applications (compact).",
      mimeType: "application/json",
    },
    async (uri) => jsonText(uri.href, await listApplications(getClient())),
  );

  server.registerResource(
    "databases",
    "coolify://databases",
    {
      title: "Databases",
      description: "List all databases (compact).",
      mimeType: "application/json",
    },
    async (uri) => jsonText(uri.href, await listDatabases(getClient())),
  );

  server.registerResource(
    "services",
    "coolify://services",
    {
      title: "Services",
      description: "List all services (compact).",
      mimeType: "application/json",
    },
    async (uri) => jsonText(uri.href, await listServices(getClient())),
  );

  server.registerResource(
    "servers",
    "coolify://servers",
    {
      title: "Servers",
      description: "List all servers (compact).",
      mimeType: "application/json",
    },
    async (uri) => jsonText(uri.href, await listServers(getClient())),
  );

  server.registerResource(
    "projects",
    "coolify://projects",
    {
      title: "Projects",
      description: "List all projects (compact).",
      mimeType: "application/json",
    },
    async (uri) => jsonText(uri.href, await listProjects(getClient())),
  );

  server.registerResource(
    "status",
    "coolify://status",
    {
      title: "Instance status",
      description: "Health + version summary.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const client = getClient();
      const [health, version] = await Promise.all([client.health(), client.version()]);
      return textText(uri.href, `health: ${health}\nversion: ${version}`);
    },
  );

  // ---- Parameterised ----

  server.registerResource(
    "application",
    new ResourceTemplate("coolify://applications/{uuid}", { list: undefined }),
    {
      title: "Application detail",
      description: "Compact application by UUID.",
      mimeType: "application/json",
    },
    async (uri, params) =>
      jsonText(uri.href, await getApplication(getClient(), params.uuid as string)),
  );

  server.registerResource(
    "database",
    new ResourceTemplate("coolify://databases/{uuid}", { list: undefined }),
    {
      title: "Database detail",
      description: "Compact database by UUID.",
      mimeType: "application/json",
    },
    async (uri, params) =>
      jsonText(uri.href, await getDatabase(getClient(), params.uuid as string)),
  );

  server.registerResource(
    "service",
    new ResourceTemplate("coolify://services/{uuid}", { list: undefined }),
    {
      title: "Service detail",
      description: "Compact service by UUID.",
      mimeType: "application/json",
    },
    async (uri, params) => jsonText(uri.href, await getService(getClient(), params.uuid as string)),
  );

  server.registerResource(
    "server",
    new ResourceTemplate("coolify://servers/{uuid}", { list: undefined }),
    {
      title: "Server detail",
      description: "Compact server by UUID.",
      mimeType: "application/json",
    },
    async (uri, params) => jsonText(uri.href, await getServer(getClient(), params.uuid as string)),
  );

  server.registerResource(
    "project",
    new ResourceTemplate("coolify://projects/{uuid}", { list: undefined }),
    {
      title: "Project detail",
      description: "Compact project by UUID.",
      mimeType: "application/json",
    },
    async (uri, params) => jsonText(uri.href, await getProject(getClient(), params.uuid as string)),
  );
}
