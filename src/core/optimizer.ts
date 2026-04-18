/**
 * Response optimizer — maps verbose Coolify API objects to compact forms.
 *
 * Stub — full transforms for every entity land in PR #3. Current version
 * implements the application transform only, sufficient for a scaffold
 * smoke test.
 */

import type { ApplicationCompact, Verbosity } from "./types.js";

/** Narrow a raw application object to compact form (PRD §7). */
// biome-ignore lint/suspicious/noExplicitAny: raw API shape is dynamic
export function toApplicationCompact(raw: any): ApplicationCompact {
  return {
    uuid: raw.uuid,
    name: raw.name,
    status: raw.status ?? "unknown",
    fqdn: raw.fqdn,
    git_repository: raw.git_repository,
    git_branch: raw.git_branch,
    build_pack: raw.build_pack ?? "unknown",
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    server_name: raw.server?.name ?? raw.destination?.server?.name,
    project_name: raw.project?.name ?? raw.environment?.project?.name,
    environment: raw.environment?.name,
    ports_mappings: raw.ports_mappings,
    health_check_status: raw.health_check_status,
    deployment_status: raw.deployment_status,
  };
}

/** Select output shape based on verbosity. Stub — standard = raw for now. */
export function applyVerbosity<T>(raw: T, verbosity: Verbosity): T | ApplicationCompact {
  if (verbosity === "compact") return toApplicationCompact(raw);
  return raw;
}
