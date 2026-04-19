import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { confirmSchema, getClient, jsonContent, requireConfirm, textContent } from "../helpers.js";

export function registerGithubTools(server: McpServer): void {
  server.registerTool(
    "list_github_apps",
    {
      title: "List GitHub Apps",
      description: "List configured GitHub App integrations.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().github.list()),
  );

  server.registerTool(
    "register_github_app",
    {
      title: "Register GitHub App",
      description:
        "Register a new GitHub App installation (the App itself, not a Coolify application using the App).",
      inputSchema: {
        payload: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { payload: Record<string, unknown> }) =>
      jsonContent(await getClient().github.create(args.payload)),
  );

  server.registerTool(
    "update_github_app",
    {
      title: "Update GitHub App",
      inputSchema: {
        uuid: z.string(),
        patch: z.record(z.string(), z.unknown()),
      },
    },
    async (args: { uuid: string; patch: Record<string, unknown> }) =>
      jsonContent(await getClient().github.update(args.uuid, args.patch)),
  );

  server.registerTool(
    "delete_github_app",
    {
      title: "Delete GitHub App",
      description: "Remove a GitHub App integration. Requires confirm:true.",
      inputSchema: { uuid: z.string(), confirm: confirmSchema },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "delete_github_app");
      await getClient().github.delete(args.uuid);
      return textContent(`Deleted ${args.uuid}`);
    },
  );

  server.registerTool(
    "list_gh_repos",
    {
      title: "List GitHub repos",
      description: "List repositories accessible to a GitHub App installation.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => jsonContent(await getClient().github.repos(args.uuid)),
  );

  server.registerTool(
    "list_gh_branches",
    {
      title: "List GitHub branches",
      description: "List branches for a specific repository under a GitHub App.",
      inputSchema: {
        uuid: z.string(),
        owner: z.string(),
        repo: z.string(),
      },
    },
    async (args: { uuid: string; owner: string; repo: string }) =>
      jsonContent(await getClient().github.branches(args.uuid, args.owner, args.repo)),
  );
}
