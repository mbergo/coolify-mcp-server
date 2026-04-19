import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, jsonContent } from "../helpers.js";

export function registerHetznerTools(server: McpServer): void {
  server.registerTool(
    "hetzner_locations",
    {
      title: "Hetzner locations",
      description: "List available Hetzner datacenter locations.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().hetzner.locations()),
  );

  server.registerTool(
    "hetzner_server_types",
    {
      title: "Hetzner server types",
      description: "List available Hetzner server types / plans.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().hetzner.serverTypes()),
  );

  server.registerTool(
    "hetzner_images",
    {
      title: "Hetzner images",
      description: "List available Hetzner OS images.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().hetzner.images()),
  );

  server.registerTool(
    "hetzner_ssh_keys",
    {
      title: "Hetzner SSH keys",
      description: "List SSH keys configured in the Hetzner account.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().hetzner.sshKeys()),
  );

  server.registerTool(
    "create_hetzner_server",
    {
      title: "Create Hetzner server",
      description: "Provision a new Hetzner cloud server and register it with Coolify.",
      inputSchema: {
        payload: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { payload: Record<string, unknown> }) =>
      jsonContent(await getClient().hetzner.createServer(args.payload)),
  );
}
