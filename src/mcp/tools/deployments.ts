import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDeployment, listDeployments } from "../../core/compact.js";
import type { Verbosity } from "../../core/types.js";
import {
  confirmSchema,
  getClient,
  jsonContent,
  requireConfirm,
  textContent,
  verbositySchema,
} from "../helpers.js";

export function registerDeploymentTools(server: McpServer): void {
  server.registerTool(
    "list_deployments",
    {
      title: "List deployments",
      description: "List recent deployments.",
      inputSchema: {
        verbosity: verbositySchema,
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: { verbosity?: Verbosity; limit?: number }) =>
      jsonContent(
        await listDeployments(getClient(), { verbosity: args.verbosity, limit: args.limit }),
      ),
  );

  server.registerTool(
    "get_deployment",
    {
      title: "Get deployment",
      description: "Fetch a single deployment by UUID.",
      inputSchema: { uuid: z.string(), verbosity: verbositySchema },
    },
    async (args: { uuid: string; verbosity?: Verbosity }) =>
      jsonContent(await getDeployment(getClient(), args.uuid, { verbosity: args.verbosity })),
  );

  server.registerTool(
    "cancel_deployment",
    {
      title: "Cancel deployment",
      description: "Cancel an in-flight deployment. Requires confirm:true.",
      inputSchema: { uuid: z.string(), confirm: confirmSchema },
    },
    async (args: { uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "cancel_deployment");
      await getClient().deploy.cancel(args.uuid);
      return textContent(`Cancelled ${args.uuid}`);
    },
  );

  server.registerTool(
    "trigger_deploy",
    {
      title: "Trigger deployment",
      description:
        "Trigger a deploy. Pass `uuid` (application) or `tag` (image tag). Use `force:true` to bypass build cache.",
      inputSchema: {
        uuid: z.string().optional(),
        tag: z.string().optional(),
        force: z.boolean().optional(),
      },
    },
    async (args: { uuid?: string; tag?: string; force?: boolean }) =>
      jsonContent(await getClient().deploy.trigger(args)),
  );
}
