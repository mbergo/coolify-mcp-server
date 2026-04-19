/**
 * coolify-11d MCP server (stdio transport).
 *
 * Thin wrapper — registry + resources live in ./bootstrap.ts so the
 * SSE connector can reuse them.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./bootstrap.js";

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("coolify-11d MCP server ready (stdio)\n");
}

main().catch((err: Error) => {
  process.stderr.write(`coolify-11d MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
