/**
 * `coolify-11d apps create-* | update | delete` commands.
 */

import type { Command } from "commander";
import type { CoolifyApiClient } from "../../core/api-client.js";
import { resolveConfig } from "../../core/config.js";
import {
  createDeployKeyApp,
  createDockerComposeApp,
  createDockerImageApp,
  createDockerfileApp,
  createGithubApp,
  createPublicApp,
} from "../../core/create-with-naming.js";
import type {
  BuildPack,
  CreateDeployKeyAppInput,
  CreateDockerComposeAppInput,
  CreateDockerImageAppInput,
  CreateDockerfileAppInput,
  CreateGithubAppInput,
  CreatePublicAppInput,
} from "../../core/types.js";
import { confirmDestructive } from "../prompt.js";

interface CommonOpts {
  name?: string;
  server: string;
  project: string;
  environment?: string;
  description?: string;
  instantDeploy?: boolean;
}

function namingOpts(cfg: ReturnType<typeof resolveConfig>, name?: string) {
  return {
    name,
    fallbackBase: name ?? "app",
    policy: cfg.namingCollision,
    suffix: cfg.namingSuffix,
  };
}

export function registerAppsWriteCommands(apps: Command, getClient: () => CoolifyApiClient): void {
  // ---- create-public ----
  apps
    .command("create-public")
    .description("Create a public-repo git application")
    .requiredOption("--server <uuid>", "Server UUID")
    .requiredOption("--project <uuid>", "Project UUID")
    .requiredOption("--repo <url>", "Git repository URL")
    .option("--branch <name>", "Git branch", "main")
    .option(
      "--build-pack <pack>",
      "nixpacks|static|dockerfile|dockercompose|dockerimage",
      "nixpacks",
    )
    .option("--name <name>", "Descriptive name (will be -11d suffixed)")
    .option("--environment <name>", "Environment name")
    .option("--ports-exposes <ports>")
    .option("--domains <domains>")
    .option("--instant-deploy")
    .action(
      async (
        opts: CommonOpts & {
          repo: string;
          branch?: string;
          buildPack?: string;
          portsExposes?: string;
          domains?: string;
        },
      ) => {
        const cfg = resolveConfig();
        const input: CreatePublicAppInput = {
          project_uuid: opts.project,
          server_uuid: opts.server,
          environment_name: opts.environment,
          git_repository: opts.repo,
          git_branch: opts.branch ?? "main",
          build_pack: (opts.buildPack ?? "nixpacks") as BuildPack,
          name: opts.name,
          description: opts.description,
          instant_deploy: opts.instantDeploy,
          ports_exposes: opts.portsExposes,
          domains: opts.domains,
        };
        const result = await createPublicApp(getClient(), input, namingOpts(cfg, opts.name));
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  // ---- create-dockerfile ----
  apps
    .command("create-dockerfile")
    .description("Create an app from a Dockerfile string")
    .requiredOption("--server <uuid>")
    .requiredOption("--project <uuid>")
    .requiredOption("--dockerfile <content>", "Dockerfile contents (use @file.Dockerfile for file)")
    .option("--name <name>")
    .option("--environment <name>")
    .option("--ports-exposes <ports>")
    .option("--domains <domains>")
    .option("--instant-deploy")
    .action(
      async (
        opts: CommonOpts & { dockerfile: string; portsExposes?: string; domains?: string },
      ) => {
        const cfg = resolveConfig();
        const dockerfile = await maybeReadFile(opts.dockerfile);
        const input: CreateDockerfileAppInput = {
          project_uuid: opts.project,
          server_uuid: opts.server,
          environment_name: opts.environment,
          dockerfile,
          name: opts.name,
          description: opts.description,
          instant_deploy: opts.instantDeploy,
          ports_exposes: opts.portsExposes,
          domains: opts.domains,
        };
        const result = await createDockerfileApp(getClient(), input, namingOpts(cfg, opts.name));
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  // ---- create-image ----
  apps
    .command("create-image")
    .description("Create an app from a Docker image")
    .requiredOption("--server <uuid>")
    .requiredOption("--project <uuid>")
    .requiredOption("--image <name>", "Registry image name (e.g. nginx)")
    .option("--tag <tag>", "Image tag", "latest")
    .option("--name <name>")
    .option("--environment <name>")
    .option("--ports-exposes <ports>")
    .option("--domains <domains>")
    .option("--instant-deploy")
    .action(
      async (
        opts: CommonOpts & { image: string; tag?: string; portsExposes?: string; domains?: string },
      ) => {
        const cfg = resolveConfig();
        const input: CreateDockerImageAppInput = {
          project_uuid: opts.project,
          server_uuid: opts.server,
          environment_name: opts.environment,
          docker_registry_image_name: opts.image,
          docker_registry_image_tag: opts.tag,
          name: opts.name,
          description: opts.description,
          instant_deploy: opts.instantDeploy,
          ports_exposes: opts.portsExposes,
          domains: opts.domains,
        };
        const result = await createDockerImageApp(getClient(), input, namingOpts(cfg, opts.name));
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  // ---- create-compose ----
  apps
    .command("create-compose")
    .description("Create an app from a docker-compose YAML")
    .requiredOption("--server <uuid>")
    .requiredOption("--project <uuid>")
    .requiredOption("--compose <content>", "docker-compose YAML (use @file.yml)")
    .option("--name <name>")
    .option("--environment <name>")
    .option("--domains <domains>")
    .option("--instant-deploy")
    .action(async (opts: CommonOpts & { compose: string; domains?: string }) => {
      const cfg = resolveConfig();
      const compose = await maybeReadFile(opts.compose);
      const input: CreateDockerComposeAppInput = {
        project_uuid: opts.project,
        server_uuid: opts.server,
        environment_name: opts.environment,
        docker_compose_raw: compose,
        name: opts.name,
        description: opts.description,
        instant_deploy: opts.instantDeploy,
        domains: opts.domains,
      };
      const result = await createDockerComposeApp(getClient(), input, namingOpts(cfg, opts.name));
      console.log(
        JSON.stringify(
          { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
          null,
          2,
        ),
      );
    });

  // ---- create-gh ----
  apps
    .command("create-gh")
    .description("Create an app using a private GitHub App")
    .requiredOption("--server <uuid>")
    .requiredOption("--project <uuid>")
    .requiredOption("--github-app <uuid>", "GitHub App UUID")
    .requiredOption("--repo <url>")
    .option("--branch <name>", "Git branch", "main")
    .option(
      "--build-pack <pack>",
      "nixpacks|dockerfile|dockercompose|dockerimage|static",
      "nixpacks",
    )
    .option("--name <name>")
    .option("--environment <name>")
    .option("--ports-exposes <ports>")
    .action(
      async (
        opts: CommonOpts & {
          githubApp: string;
          repo: string;
          branch?: string;
          buildPack?: string;
          portsExposes?: string;
        },
      ) => {
        const cfg = resolveConfig();
        const input: CreateGithubAppInput = {
          project_uuid: opts.project,
          server_uuid: opts.server,
          environment_name: opts.environment,
          github_app_uuid: opts.githubApp,
          git_repository: opts.repo,
          git_branch: opts.branch ?? "main",
          build_pack: (opts.buildPack ?? "nixpacks") as BuildPack,
          name: opts.name,
          description: opts.description,
          instant_deploy: opts.instantDeploy,
          ports_exposes: opts.portsExposes,
        };
        const result = await createGithubApp(getClient(), input, namingOpts(cfg, opts.name));
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  // ---- create-deploy-key ----
  apps
    .command("create-deploy-key")
    .description("Create an app using a private deploy key")
    .requiredOption("--server <uuid>")
    .requiredOption("--project <uuid>")
    .requiredOption("--private-key <uuid>", "Private key UUID")
    .requiredOption("--repo <url>")
    .option("--branch <name>", "Git branch", "main")
    .option(
      "--build-pack <pack>",
      "nixpacks|dockerfile|dockercompose|dockerimage|static",
      "nixpacks",
    )
    .option("--name <name>")
    .option("--environment <name>")
    .option("--ports-exposes <ports>")
    .action(
      async (
        opts: CommonOpts & {
          privateKey: string;
          repo: string;
          branch?: string;
          buildPack?: string;
          portsExposes?: string;
        },
      ) => {
        const cfg = resolveConfig();
        const input: CreateDeployKeyAppInput = {
          project_uuid: opts.project,
          server_uuid: opts.server,
          environment_name: opts.environment,
          private_key_uuid: opts.privateKey,
          git_repository: opts.repo,
          git_branch: opts.branch ?? "main",
          build_pack: (opts.buildPack ?? "nixpacks") as BuildPack,
          name: opts.name,
          description: opts.description,
          instant_deploy: opts.instantDeploy,
          ports_exposes: opts.portsExposes,
        };
        const result = await createDeployKeyApp(getClient(), input, namingOpts(cfg, opts.name));
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  // ---- delete ----
  apps
    .command("delete <uuid>")
    .description("Delete an application")
    .option("-y, --yes", "Skip confirmation")
    .action(async (uuid: string, opts: { yes?: boolean }) => {
      await confirmDestructive("delete application", uuid, Boolean(opts.yes));
      await getClient().apps.delete(uuid);
      console.log(`Deleted ${uuid}`);
    });

  // ---- update ----
  apps
    .command("update <uuid>")
    .description("Update an application (PATCH arbitrary fields; pass --field key=value)")
    .option("--field <key=value...>", "Field updates (repeatable)")
    .action(async (uuid: string, opts: { field?: string[] }) => {
      const patch = parseFields(opts.field ?? []);
      if (Object.keys(patch).length === 0) {
        throw new Error("No fields provided. Use --field key=value (can repeat).");
      }
      await getClient().apps.update(uuid, patch);
      console.log(`Updated ${uuid}: ${JSON.stringify(patch)}`);
    });
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function maybeReadFile(value: string): Promise<string> {
  if (value.startsWith("@")) {
    const { readFile } = await import("node:fs/promises");
    return readFile(value.slice(1), "utf8");
  }
  return value;
}

function parseFields(fields: string[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const idx = f.indexOf("=");
    if (idx < 0) throw new Error(`Malformed --field "${f}". Use key=value.`);
    const key = f.slice(0, idx);
    const rawVal = f.slice(idx + 1);
    if (rawVal === "true") out[key] = true;
    else if (rawVal === "false") out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(rawVal)) out[key] = Number(rawVal);
    else out[key] = rawVal;
  }
  return out;
}
