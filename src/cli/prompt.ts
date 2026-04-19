/**
 * Prompt helpers wrapping @inquirer/prompts.
 *
 * Tests stub these via the --yes escape hatch; full TTY interaction is
 * only exercised in e2e tests.
 */

import {
  confirm as inqConfirm,
  input as inqInput,
  password as inqPassword,
  select as inqSelect,
} from "@inquirer/prompts";

export interface ConfirmOptions {
  message: string;
  default?: boolean;
  /** When true, skip prompt and return true. */
  assumeYes?: boolean;
}

export async function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (opts.assumeYes) return true;
  return inqConfirm({ message: opts.message, default: opts.default ?? false });
}

export interface InputOptions {
  message: string;
  default?: string;
  required?: boolean;
  validate?: (v: string) => boolean | string;
}

export async function input(opts: InputOptions): Promise<string> {
  return inqInput({
    message: opts.message,
    default: opts.default,
    required: opts.required,
    validate: opts.validate,
  });
}

export interface PasswordOptions {
  message: string;
  mask?: boolean;
}

export async function password(opts: PasswordOptions): Promise<string> {
  return inqPassword({ message: opts.message, mask: opts.mask ?? true });
}

export interface SelectChoice<T> {
  name: string;
  value: T;
  description?: string;
}

export interface SelectOptions<T> {
  message: string;
  choices: SelectChoice<T>[];
  default?: T;
}

export async function select<T>(opts: SelectOptions<T>): Promise<T> {
  return inqSelect({
    message: opts.message,
    choices: opts.choices,
    default: opts.default,
  });
}

/** Guard for destructive operations. Throws if user declines. */
export async function confirmDestructive(
  kind: string,
  id: string,
  assumeYes: boolean,
): Promise<void> {
  const ok = await confirm({
    message: `Really ${kind} ${id}? This cannot be undone.`,
    default: false,
    assumeYes,
  });
  if (!ok) throw new Error("Aborted by user.");
}
