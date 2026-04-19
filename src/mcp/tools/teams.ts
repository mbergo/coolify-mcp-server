import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, jsonContent } from "../helpers.js";

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    "list_teams",
    {
      title: "List teams",
      description: "List all teams.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().team.list()),
  );

  server.registerTool(
    "get_team",
    {
      title: "Get team",
      description: "Fetch a team by id.",
      inputSchema: { id: z.union([z.string(), z.number()]) },
    },
    async (args: { id: string | number }) => jsonContent(await getClient().team.get(args.id)),
  );

  server.registerTool(
    "team_members",
    {
      title: "Team members",
      description: "List members of a team.",
      inputSchema: { id: z.union([z.string(), z.number()]) },
    },
    async (args: { id: string | number }) => jsonContent(await getClient().team.members(args.id)),
  );

  server.registerTool(
    "current_team",
    {
      title: "Current team",
      description: "The team associated with the configured API token.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().team.current()),
  );

  server.registerTool(
    "current_team_members",
    {
      title: "Current team members",
      description: "Members of the token's team.",
      inputSchema: {},
    },
    async () => jsonContent(await getClient().team.currentMembers()),
  );
}
