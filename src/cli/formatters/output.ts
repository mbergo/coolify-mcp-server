/**
 * Minimal output formatters — JSON + compact table-ish fallback.
 *
 * Full table/minimal/yaml formatters land in PR #5. This module is
 * deliberately zero-dep so the CLI smoke test stays fast.
 */

import type { OutputFormat } from "../../core/types.js";

export interface FormatOptions {
  format?: OutputFormat;
}

export function formatOutput(value: unknown, opts: FormatOptions = {}): string {
  const fmt = opts.format ?? "json";
  switch (fmt) {
    case "json":
      return JSON.stringify(value, null, 2);
    case "minimal":
      return minimal(value);
    case "yaml":
      return naiveYaml(value, 0);
    case "table":
      return table(value);
    default:
      return JSON.stringify(value);
  }
}

function minimal(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(minimal).join("\n");
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const uuid = obj.uuid ?? obj.id ?? "";
    const name = obj.name ?? "";
    const status = obj.status ?? "";
    return `${uuid}\t${name}\t${status}`.trim();
  }
  return String(value);
}

function table(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return JSON.stringify(value, null, 2);
  const items = value as Record<string, unknown>[];
  const first = items[0];
  if (!first) return "";
  const cols = Object.keys(first);
  const widths = cols.map((c) =>
    Math.max(c.length, ...items.map((i) => String(i[c] ?? "").length)),
  );
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const header = cols.map((c, i) => pad(c, widths[i] ?? 0)).join("  ");
  const sep = cols.map((_, i) => "-".repeat(widths[i] ?? 0)).join("  ");
  const rows = items.map((i) =>
    cols.map((c, j) => pad(String(i[c] ?? ""), widths[j] ?? 0)).join("  "),
  );
  return [header, sep, ...rows].join("\n");
}

function naiveYaml(value: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  if (value === null || value === undefined) return `${pad}null`;
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "object" && v !== null
          ? `${pad}-\n${naiveYaml(v, depth + 1)}`
          : `${pad}- ${String(v)}`,
      )
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) =>
        typeof v === "object" && v !== null
          ? `${pad}${k}:\n${naiveYaml(v, depth + 1)}`
          : `${pad}${k}: ${String(v)}`,
      )
      .join("\n");
  }
  return `${pad}${String(value)}`;
}
