import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { probeTokenScope } from "../../core/auth.js";
import { getClient, jsonContent, textContent } from "../helpers.js";

export function registerSystemTools(server: McpServer): void {
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

  server.registerTool(
    "system_enable_api",
    {
      title: "Enable Coolify API",
      description: "Idempotent call to /api/v1/enable — no-op if already enabled.",
      inputSchema: {},
    },
    async () => {
      await getClient().enableApi();
      return textContent("API enabled.");
    },
  );

  server.registerTool(
    "system_healthcheck",
    {
      title: "System healthcheck",
      description: "GET /api/v1/healthcheck — runtime diagnostics.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().system.healthcheck()),
  );

  server.registerTool(
    "system_probe_scope",
    {
      title: "Probe token scope",
      description:
        "Runs read-only probes to detect whether the configured token is read-only, read:sensitive, or *.",
      inputSchema: {},
    },
    async () => jsonContent(await probeTokenScope(getClient())),
  );
}
