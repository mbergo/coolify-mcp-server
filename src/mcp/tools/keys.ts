import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { confirmSchema, getClient, jsonContent, requireConfirm, textContent } from "../helpers.js";

export function registerKeysTools(server: McpServer): void {
  server.registerTool(
    "list_keys",
    {
      title: "List private keys",
      description: "List all configured SSH private keys (sensitive material redacted).",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().keys.list()),
  );

  server.registerTool(
    "get_key",
    {
      title: "Get private key",
      description: "Fetch a single private key by UUID.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().keys.get(args.uuid)),
  );

  server.registerTool(
    "create_key",
    {
      title: "Create private key",
      description: "Register a new SSH private key. Payload fields per Coolify API.",
      inputSchema: {
        payload: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { payload: Record<string, unknown> }) =>
      jsonContent(await getClient().keys.create(args.payload)),
  );

  server.registerTool(
    "update_key",
    {
      title: "Update private key",
      description: "PATCH private-key fields.",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().keys.update(args.uuid, args.patch)),
  );

  server.registerTool(
    "delete_key",
    {
      title: "Delete private key",
      description: "Remove a stored private key. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_key");
      await getClient().keys.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );
}
