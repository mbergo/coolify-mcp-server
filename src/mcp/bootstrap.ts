/**
 * Shared MCP server bootstrap.
 *
 * Both the stdio entry (src/mcp/server.ts) and the SSE connector
 * (src/connector/server.ts) construct an McpServer via createMcpServer()
 * so the tool registry + resources stay in one place.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "./resources.js";
import { registerAppsTools } from "./tools/apps.js";
import { registerCloudTools } from "./tools/cloud.js";
import { registerCompositeTools } from "./tools/composites.js";
import { registerDatabaseTools } from "./tools/databases.js";
import { registerDeploymentTools } from "./tools/deployments.js";
import { registerGithubTools } from "./tools/github.js";
import { registerHetznerTools } from "./tools/hetzner.js";
import { registerKeysTools } from "./tools/keys.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerResourcesTool } from "./tools/resources.js";
import { registerSearchTool } from "./tools/search.js";
import { registerServerTools } from "./tools/servers.js";
import { registerServiceTools } from "./tools/services.js";
import { registerSystemTools } from "./tools/system.js";
import { registerTeamTools } from "./tools/teams.js";

export interface CreateMcpServerOptions {
  name?: string;
  version?: string;
}

export function createMcpServer(opts: CreateMcpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: opts.name ?? "coolify-11d",
    version: opts.version ?? "0.1.0",
  });

  registerSystemTools(server);
  registerAppsTools(server);
  registerDatabaseTools(server);
  registerServiceTools(server);
  registerDeploymentTools(server);
  registerServerTools(server);
  registerProjectTools(server);
  registerTeamTools(server);
  registerKeysTools(server);
  registerResourcesTool(server);
  registerGithubTools(server);
  registerCloudTools(server);
  registerHetznerTools(server);
  registerSearchTool(server);
  registerCompositeTools(server);

  registerResources(server);

  return server;
}
