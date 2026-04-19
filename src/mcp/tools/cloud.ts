import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { confirmSchema, getClient, jsonContent, requireConfirm, textContent } from "../helpers.js";

export function registerCloudTools(server: McpServer): void {
  server.registerTool(
    "list_cloud_tokens",
    {
      title: "List cloud tokens",
      description: "List configured cloud-provider tokens (values redacted).",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().cloud.list()),
  );

  server.registerTool(
    "get_cloud_token",
    {
      title: "Get cloud token",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().cloud.get(args.uuid)),
  );

  server.registerTool(
    "create_cloud_token",
    {
      title: "Create cloud token",
      description: "Register a new cloud-provider token.",
      inputSchema: {
        payload: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { payload: Record<string, unknown> }) =>
      jsonContent(await getClient().cloud.create(args.payload)),
  );

  server.registerTool(
    "update_cloud_token",
    {
      title: "Update cloud token",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().cloud.update(args.uuid, args.patch)),
  );

  server.registerTool(
    "delete_cloud_token",
    {
      title: "Delete cloud token",
      description: "Permanently remove a cloud token. Requires confirm:true.",
      inputSchema: {
        uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_cloud_token");
      await getClient().cloud.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  server.registerTool(
    "validate_cloud_token",
    {
      title: "Validate cloud token",
      description: "Ping the cloud provider with the stored token.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().cloud.validate(args.uuid)),
  );
}
