/**
 * coolify-11d MCP server (stdio transport).
 *
 * Scaffold — registers a minimal `system_health` tool for smoke testing.
 * Full tool registry (~90 tools per PRD §6) lands in PR #6.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CoolifyApiClient } from "../core/api-client.js";
import { resolveConfig } from "../core/config.js";

function getClient(): CoolifyApiClient {
  const cfg = resolveConfig();
  return new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: "coolify-11d",
    version: "0.1.0",
  });

  server.registerTool(
    "system_health",
    {
      title: "System health",
      description: "Ping the configured Coolify instance (/api/health).",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.health();
      return {
        content: [{ type: "text", text: result }],
      };
    },
  );

  server.registerTool(
    "system_version",
    {
      title: "Coolify version",
      description: "Return the Coolify instance version.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.version();
      return {
        content: [{ type: "text", text: result }],
      };
    },
  );

  // Zod import retained for future tool schemas — touch once so biome
  // doesn't flag the import during the scaffold build.
  void z;

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP stdio: log to stderr only.
  process.stderr.write("coolify-11d MCP server ready (stdio)\n");
}

main().catch((err: Error) => {
  process.stderr.write(`coolify-11d MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
