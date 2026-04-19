/**
 * Smart resource lookup (PRD §7.3).
 *
 * Resolves a user-supplied query into concrete resource refs across:
 *   • Applications (uuid / name / fqdn)
 *   • Databases    (uuid / name)
 *   • Services     (uuid / name)
 *   • Servers      (uuid / name / ip)
 *   • Projects     (uuid / name)
 *
 * Match order: exact UUID → exact name → exact domain/ip → fuzzy name.
 * Fuzzy matching is a simple substring + edit-distance score (no fuse.js
 * dep for the core module; composites that want full fuzzy can import
 * fuse.js separately in MCP composites).
 */

import type { CoolifyApiClient } from "./api-client.js";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export type ResourceKind = "application" | "database" | "service" | "server" | "project";

export interface ResourceMatch {
  kind: ResourceKind;
  uuid: string;
  name: string;
  /** What about the resource matched: "uuid" | "name" | "fqdn" | "ip" | "fuzzy". */
  matchedOn: "uuid" | "name" | "fqdn" | "ip" | "fuzzy";
  /** 1.0 = exact; < 1.0 = fuzzy score. */
  score: number;
  /** Optional extras for UI: fqdn, ip, status. */
  extras?: Record<string, unknown>;
}

export interface SearchOptions {
  /** Restrict search to these kinds. Default: all. */
  kinds?: ResourceKind[];
  /** Stop early when an exact match is found. Default: true. */
  exactFirst?: boolean;
  /** Minimum fuzzy score to include (0..1). Default: 0.4. */
  fuzzyThreshold?: number;
  /** Max results to return. Default: 20. */
  limit?: number;
}

// ----------------------------------------------------------------
// Fuzzy score (substring + length-normalized Levenshtein)
// ----------------------------------------------------------------

function substringScore(needle: string, hay: string): number {
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (h === n) return 1.0;
  if (h.includes(n)) return 0.85 - Math.max(0, (h.length - n.length) / (h.length * 4));
  return 0;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = new Array(n + 1);
  const curr: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[n] ?? 0;
}

function fuzzyScore(needle: string, hay: string): number {
  if (!needle || !hay) return 0;
  const sub = substringScore(needle, hay);
  if (sub > 0) return sub;
  const dist = levenshtein(needle.toLowerCase(), hay.toLowerCase());
  const maxLen = Math.max(needle.length, hay.length);
  const score = 1 - dist / maxLen;
  return score >= 0 ? score : 0;
}

// ----------------------------------------------------------------
// Resolver
// ----------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s) || /^[a-zA-Z0-9]{8,}$/.test(s); // Coolify sometimes uses shorter UUIDs
}

function looksLikeIp(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

function looksLikeDomain(s: string): boolean {
  return /\./.test(s) && !looksLikeIp(s) && !looksLikeUuid(s);
}

// ----------------------------------------------------------------
// Main API
// ----------------------------------------------------------------

export async function searchResources(
  client: CoolifyApiClient,
  query: string,
  opts: SearchOptions = {},
): Promise<ResourceMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const kinds = opts.kinds ?? ["application", "database", "service", "server", "project"];
  const threshold = opts.fuzzyThreshold ?? 0.4;
  const limit = opts.limit ?? 20;
  const exactFirst = opts.exactFirst ?? true;

  // Parallel-fetch the listings we need.
  const [apps, dbs, svcs, servers, projects] = await Promise.all([
    kinds.includes("application") ? client.apps.list() : Promise.resolve([]),
    kinds.includes("database") ? client.db.list() : Promise.resolve([]),
    kinds.includes("service") ? client.svc.list() : Promise.resolve([]),
    kinds.includes("server") ? client.server.list() : Promise.resolve([]),
    kinds.includes("project") ? client.project.list() : Promise.resolve([]),
  ]);

  const matches: ResourceMatch[] = [];
  const pushMatch = (m: ResourceMatch) => matches.push(m);

  // ---- Applications ----
  for (const a of apps) {
    if (!a) continue;
    if (looksLikeUuid(q) && a.uuid === q) {
      pushMatch({
        kind: "application",
        uuid: a.uuid,
        name: a.name,
        matchedOn: "uuid",
        score: 1,
        extras: { fqdn: a.fqdn, status: a.status },
      });
      continue;
    }
    if (a.name === q) {
      pushMatch({
        kind: "application",
        uuid: a.uuid,
        name: a.name,
        matchedOn: "name",
        score: 1,
        extras: { fqdn: a.fqdn, status: a.status },
      });
      continue;
    }
    if (a.fqdn && (a.fqdn === q || a.fqdn.includes(q))) {
      pushMatch({
        kind: "application",
        uuid: a.uuid,
        name: a.name,
        matchedOn: "fqdn",
        score: a.fqdn === q ? 1 : 0.9,
        extras: { fqdn: a.fqdn, status: a.status },
      });
      continue;
    }
    const score = fuzzyScore(q, a.name);
    if (score >= threshold) {
      pushMatch({
        kind: "application",
        uuid: a.uuid,
        name: a.name,
        matchedOn: "fuzzy",
        score,
        extras: { fqdn: a.fqdn, status: a.status },
      });
    }
  }

  // ---- Databases ----
  for (const d of dbs) {
    if (!d) continue;
    if (looksLikeUuid(q) && d.uuid === q) {
      pushMatch({
        kind: "database",
        uuid: d.uuid,
        name: d.name,
        matchedOn: "uuid",
        score: 1,
        extras: { type: d.type, status: d.status },
      });
      continue;
    }
    if (d.name === q) {
      pushMatch({
        kind: "database",
        uuid: d.uuid,
        name: d.name,
        matchedOn: "name",
        score: 1,
        extras: { type: d.type, status: d.status },
      });
      continue;
    }
    const score = fuzzyScore(q, d.name);
    if (score >= threshold) {
      pushMatch({
        kind: "database",
        uuid: d.uuid,
        name: d.name,
        matchedOn: "fuzzy",
        score,
        extras: { type: d.type, status: d.status },
      });
    }
  }

  // ---- Services ----
  for (const s of svcs) {
    if (!s) continue;
    if (looksLikeUuid(q) && s.uuid === q) {
      pushMatch({
        kind: "service",
        uuid: s.uuid,
        name: s.name,
        matchedOn: "uuid",
        score: 1,
        extras: { service_type: s.service_type, status: s.status },
      });
      continue;
    }
    if (s.name === q) {
      pushMatch({
        kind: "service",
        uuid: s.uuid,
        name: s.name,
        matchedOn: "name",
        score: 1,
        extras: { service_type: s.service_type, status: s.status },
      });
      continue;
    }
    const score = fuzzyScore(q, s.name);
    if (score >= threshold) {
      pushMatch({
        kind: "service",
        uuid: s.uuid,
        name: s.name,
        matchedOn: "fuzzy",
        score,
        extras: { service_type: s.service_type, status: s.status },
      });
    }
  }

  // ---- Servers ----
  for (const srv of servers) {
    if (!srv) continue;
    if (looksLikeUuid(q) && srv.uuid === q) {
      pushMatch({
        kind: "server",
        uuid: srv.uuid,
        name: srv.name,
        matchedOn: "uuid",
        score: 1,
        extras: { ip: srv.ip, is_reachable: srv.is_reachable },
      });
      continue;
    }
    if (srv.name === q) {
      pushMatch({
        kind: "server",
        uuid: srv.uuid,
        name: srv.name,
        matchedOn: "name",
        score: 1,
        extras: { ip: srv.ip, is_reachable: srv.is_reachable },
      });
      continue;
    }
    if (looksLikeIp(q) && srv.ip === q) {
      pushMatch({
        kind: "server",
        uuid: srv.uuid,
        name: srv.name,
        matchedOn: "ip",
        score: 1,
        extras: { ip: srv.ip, is_reachable: srv.is_reachable },
      });
      continue;
    }
    const score = fuzzyScore(q, srv.name);
    if (score >= threshold) {
      pushMatch({
        kind: "server",
        uuid: srv.uuid,
        name: srv.name,
        matchedOn: "fuzzy",
        score,
        extras: { ip: srv.ip, is_reachable: srv.is_reachable },
      });
    }
  }

  // ---- Projects ----
  for (const p of projects) {
    if (!p) continue;
    if (looksLikeUuid(q) && p.uuid === q) {
      pushMatch({ kind: "project", uuid: p.uuid, name: p.name, matchedOn: "uuid", score: 1 });
      continue;
    }
    if (p.name === q) {
      pushMatch({ kind: "project", uuid: p.uuid, name: p.name, matchedOn: "name", score: 1 });
      continue;
    }
    const score = fuzzyScore(q, p.name);
    if (score >= threshold) {
      pushMatch({
        kind: "project",
        uuid: p.uuid,
        name: p.name,
        matchedOn: "fuzzy",
        score,
      });
    }
  }

  // Sort: exact (score=1) first, then by score desc.
  matches.sort((a, b) => b.score - a.score);

  if (exactFirst) {
    const exacts = matches.filter((m) => m.score === 1);
    if (exacts.length > 0) return exacts.slice(0, limit);
  }

  return matches.slice(0, limit);
}

// Exported for tests
export const _internals = { fuzzyScore, levenshtein, looksLikeUuid, looksLikeIp, looksLikeDomain };
