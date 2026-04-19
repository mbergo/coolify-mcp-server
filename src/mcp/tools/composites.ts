/**
 * Composite / power tools — higher-level flows built on top of the
 * api-client and the search module (PRD §10.3).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listApplications,
  listDatabases,
  listDeployments,
  listServers,
  listServices,
} from "../../core/compact.js";
import { resolveConfig } from "../../core/config.js";
import { applyElevenDSuffix, resolveName } from "../../core/naming.js";
import { confirmSchema, getClient, jsonContent, requireConfirm, textContent } from "../helpers.js";

export function registerCompositeTools(server: McpServer): void {
  // ---- status_overview ----
  server.registerTool(
    "status_overview",
    {
      title: "Status overview",
      description:
        "Dashboard snapshot: server count + reachability, app counts by status, recent deployments, database + service counts.",
      inputSchema: {
        limit_deployments: z.number().int().positive().max(50).default(10),
      },
    },
    async (args: { limit_deployments?: number }) => {
      const client = getClient();
      const [servers, apps, dbs, svcs, deployments] = await Promise.all([
        listServers(client, { verbosity: "compact" }),
        listApplications(client, { verbosity: "compact" }),
        listDatabases(client, { verbosity: "compact" }),
        listServices(client, { verbosity: "compact" }),
        listDeployments(client, {
          verbosity: "compact",
          limit: args.limit_deployments ?? 10,
        }),
      ]);

      const appsByStatus: Record<string, number> = {};
      for (const a of apps as { status?: string }[]) {
        const k = a.status ?? "unknown";
        appsByStatus[k] = (appsByStatus[k] ?? 0) + 1;
      }
      const serversReachable = (servers as { is_reachable?: boolean }[]).filter(
        (s) => s.is_reachable,
      ).length;

      return jsonContent({
        generated_at: new Date().toISOString(),
        servers: {
          total: servers.length,
          reachable: serversReachable,
          unreachable: servers.length - serversReachable,
        },
        applications: { total: apps.length, by_status: appsByStatus },
        databases: { total: dbs.length },
        services: { total: svcs.length },
        recent_deployments: deployments,
      });
    },
  );

  // ---- rename_resource ----
  server.registerTool(
    "rename_resource",
    {
      title: "Rename resource (apply -11d convention)",
      description:
        "Apply the -11d naming convention to an existing resource. Strips supabase-<sha>, sanitises unsafe chars, resolves collisions via the configured policy, and issues PATCH.",
      inputSchema: {
        kind: z.enum(["application", "database", "service", "server", "project"]),
        uuid: z.string(),
        desired_name: z.string().describe("Descriptive base name (without -11d)"),
      },
    },
    async (args: {
      kind: "application" | "database" | "service" | "server" | "project";
      uuid: string;
      desired_name: string;
    }) => {
      const cfg = resolveConfig();
      const client = getClient();

      // Build a "list existing names" function per kind.
      const existing = async (): Promise<string[]> => {
        switch (args.kind) {
          case "application":
            return (await client.apps.list()).map((a) => a.name).filter(Boolean);
          case "database":
            return (await client.db.list()).map((d) => d.name).filter(Boolean);
          case "service":
            return (await client.svc.list()).map((s) => s.name).filter(Boolean);
          case "server":
            return (await client.server.list()).map((s) => s.name).filter(Boolean);
          case "project":
            return (await client.project.list()).map((p) => p.name).filter(Boolean);
        }
      };

      const resolved = await resolveName({
        base: args.desired_name,
        suffix: cfg.namingSuffix,
        policy: cfg.namingCollision,
        existing,
      });

      switch (args.kind) {
        case "application":
          await client.apps.update(args.uuid, { name: resolved.name });
          break;
        case "database":
          await client.db.update(args.uuid, { name: resolved.name });
          break;
        case "service":
          await client.svc.update(args.uuid, { name: resolved.name });
          break;
        case "server":
          await client.server.update(args.uuid, { name: resolved.name });
          break;
        case "project":
          await client.project.update(args.uuid, { name: resolved.name });
          break;
      }

      return jsonContent({
        uuid: args.uuid,
        kind: args.kind,
        finalName: resolved.name,
        collided: resolved.collided,
      });
    },
  );

  // ---- restart_project_apps ----
  server.registerTool(
    "restart_project_apps",
    {
      title: "Restart all apps in a project",
      description: "Restart every application inside the given project UUID.",
      inputSchema: {
        project_uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { project_uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "restart_project_apps");
      const client = getClient();
      const apps = await client.apps.list({ project_uuid: args.project_uuid });
      const results = await Promise.allSettled(apps.map((a) => client.apps.restart(a.uuid)));
      return jsonContent({
        project_uuid: args.project_uuid,
        restarted: results.filter((r) => r.status === "fulfilled").length,
        failed: results
          .map((r, i) =>
            r.status === "rejected"
              ? { uuid: apps[i]?.uuid, error: String((r as PromiseRejectedResult).reason) }
              : null,
          )
          .filter(Boolean),
        total: apps.length,
      });
    },
  );

  // ---- bulk_env_update ----
  server.registerTool(
    "bulk_env_update",
    {
      title: "Bulk env var upsert across apps",
      description:
        "Upsert a single env var (key/value) across multiple applications. Each app receives one createEnv call.",
      inputSchema: {
        app_uuids: z.array(z.string()).min(1),
        env: z.object({
          key: z.string(),
          value: z.string(),
          is_preview: z.boolean().optional(),
          is_build_time: z.boolean().optional(),
          is_literal: z.boolean().optional(),
        }),
      },
    },
    async (args: {
      app_uuids: string[];
      env: { key: string; value: string } & Record<string, unknown>;
    }) => {
      const client = getClient();
      const results = await Promise.allSettled(
        args.app_uuids.map((uuid) => client.apps.createEnv(uuid, args.env as never)),
      );
      return jsonContent({
        key: args.env.key,
        succeeded: results.filter((r) => r.status === "fulfilled").length,
        failed: results
          .map((r, i) =>
            r.status === "rejected"
              ? {
                  app_uuid: args.app_uuids[i],
                  error: String((r as PromiseRejectedResult).reason),
                }
              : null,
          )
          .filter(Boolean),
        total: args.app_uuids.length,
      });
    },
  );

  // ---- emergency_stop_all ----
  server.registerTool(
    "emergency_stop_all",
    {
      title: "EMERGENCY — stop all running applications",
      description:
        "Stops every running application across the entire Coolify instance. Strictly destructive — requires confirm:true. Returns a per-app success/failure report.",
      inputSchema: {
        confirm: confirmSchema,
        server_uuid: z.string().optional().describe("Optional: restrict to a single server"),
      },
    },
    async (args: { confirm: boolean; server_uuid?: string }) => {
      requireConfirm(args.confirm, "emergency_stop_all");
      const client = getClient();
      const apps = await client.apps.list(
        args.server_uuid ? { server_uuid: args.server_uuid } : undefined,
      );
      const running = apps.filter((a) => (a.status ?? "").toLowerCase().includes("running"));
      const results = await Promise.allSettled(running.map((a) => client.apps.stop(a.uuid)));
      return jsonContent({
        scope: args.server_uuid ? `server ${args.server_uuid}` : "instance-wide",
        stopped: results.filter((r) => r.status === "fulfilled").length,
        failed: results
          .map((r, i) =>
            r.status === "rejected"
              ? { uuid: running[i]?.uuid, error: String((r as PromiseRejectedResult).reason) }
              : null,
          )
          .filter(Boolean),
        total_running: running.length,
      });
    },
  );

  // ---- redeploy_project ----
  server.registerTool(
    "redeploy_project",
    {
      title: "Redeploy all apps in a project",
      description:
        "Force-rebuild + redeploy every application in a project via /deploy?uuid=<app>&force=true. Requires confirm:true.",
      inputSchema: {
        project_uuid: z.string(),
        confirm: confirmSchema,
      },
    },
    async (args: { project_uuid: string; confirm: boolean }) => {
      requireConfirm(args.confirm, "redeploy_project");
      const client = getClient();
      const apps = await client.apps.list({ project_uuid: args.project_uuid });
      const results = await Promise.allSettled(
        apps.map((a) => client.deploy.trigger({ uuid: a.uuid, force: true })),
      );
      return jsonContent({
        project_uuid: args.project_uuid,
        triggered: results.filter((r) => r.status === "fulfilled").length,
        failed: results
          .map((r, i) =>
            r.status === "rejected"
              ? { uuid: apps[i]?.uuid, error: String((r as PromiseRejectedResult).reason) }
              : null,
          )
          .filter(Boolean),
        total: apps.length,
      });
    },
  );

  // ---- preview_elevend_name (no side effects, handy for agents) ----
  server.registerTool(
    "preview_elevend_name",
    {
      title: "Preview -11d name",
      description:
        "Non-destructive: show what <base> would become under current suffix + collision policy (doesn't query existing names).",
      inputSchema: {
        base: z.string(),
      },
    },
    async (args: { base: string }) => {
      const cfg = resolveConfig();
      return textContent(applyElevenDSuffix(args.base, { suffix: cfg.namingSuffix }));
    },
  );
}
