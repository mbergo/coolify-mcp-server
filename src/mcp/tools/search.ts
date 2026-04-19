import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchResources } from "../../core/search.js";
import { getClient, jsonContent } from "../helpers.js";

export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    "search_resources",
    {
      title: "Search resources",
      description:
        "Smart search across applications, databases, services, servers, and projects. Matches UUID, exact name, domain/fqdn, server IP, or fuzzy name.",
      inputSchema: {
        query: z.string().min(1),
        kinds: z
          .array(z.enum(["application", "database", "service", "server", "project"]))
          .optional(),
        limit: z.number().int().positive().max(50).default(20),
        fuzzyThreshold: z.number().min(0).max(1).default(0.4),
      },
    },
    async (args: {
      query: string;
      kinds?: ("application" | "database" | "service" | "server" | "project")[];
      limit?: number;
      fuzzyThreshold?: number;
    }) =>
      jsonContent(
        await searchResources(getClient(), args.query, {
          kinds: args.kinds,
          limit: args.limit,
          fuzzyThreshold: args.fuzzyThreshold,
        }),
      ),
  );
}
