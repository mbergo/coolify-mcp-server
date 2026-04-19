/**
 * coolify-11d MCP server (stdio transport).
 *
 * Full tool registry (~90 tools) + resource templates + composite tools.
 * Tools are organized into modules under src/mcp/tools/ and registered
 * here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

async function main(): Promise<void> {
  const server = new McpServer({ name: "coolify-11d", version: "0.1.0" });

  // ---- Tool modules (order = appearance order in tool lists) ----
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

  // ---- MCP resources (coolify://...) ----
  registerResources(server);

  // ---- Connect transport ----
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("coolify-11d MCP server ready (stdio)\n");
}

main().catch((err: Error) => {
  process.stderr.write(`coolify-11d MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
