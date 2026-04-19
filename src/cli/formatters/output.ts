/**
 * Output formatters — table (cli-table3) + json + minimal + yaml.
 */

import Table from "cli-table3";
import type { OutputFormat } from "../../core/types.js";

export interface FormatOptions {
  format?: OutputFormat;
}

export function formatOutput(value: unknown, opts: FormatOptions = {}): string {
  const fmt = opts.format ?? "table";
  switch (fmt) {
    case "json":
      return JSON.stringify(value, null, 2);
    case "minimal":
      return minimal(value);
    case "yaml":
      return naiveYaml(value, 0);
    case "table":
      return asTable(value);
    default:
      return JSON.stringify(value);
  }
}

function minimal(value: unknown): string {
  if (Array.isArray(value)) return value.map(minimal).join("\n");
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const uuid = obj.uuid ?? obj.id ?? "";
    const name = obj.name ?? "";
    const status = obj.status ?? "";
    return `${uuid}\t${name}\t${status}`.trim();
  }
  return String(value);
}

/** Render arrays of records as an ASCII table; objects become key/value rows. */
function asTable(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "(no results)";
    const items = value as Record<string, unknown>[];
    const first = items[0];
    if (!first || typeof first !== "object") return JSON.stringify(value, null, 2);
    const cols = Object.keys(first);
    const table = new Table({
      head: cols,
      style: { head: ["cyan"], border: ["grey"] },
      wordWrap: true,
    });
    for (const item of items) {
      table.push(cols.map((c) => renderCell(item[c])));
    }
    return table.toString();
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const table = new Table({
      head: ["field", "value"],
      style: { head: ["cyan"], border: ["grey"] },
      wordWrap: true,
      colWidths: [24, 80],
    });
    for (const [k, v] of entries) table.push([k, renderCell(v)]);
    return table.toString();
  }
  return String(value);
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
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
