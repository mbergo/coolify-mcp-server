import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, jsonContent } from "../helpers.js";

export function registerResourcesTool(server: McpServer): void {
  server.registerTool(
    "list_resources",
    {
      title: "List all resources",
      description: "GET /resources — generic cross-type resource list.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().resources.list()),
  );
}
