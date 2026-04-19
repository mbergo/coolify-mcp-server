import { describe, expect, it } from "vitest";
import { confirm, confirmDestructive } from "../../src/cli/prompt.js";

describe("prompt — assumeYes bypass", () => {
  it("confirm returns true without TTY when assumeYes=true", async () => {
    const result = await confirm({ message: "proceed?", assumeYes: true });
    expect(result).toBe(true);
  });

  it("confirmDestructive succeeds silently with assumeYes=true", async () => {
    await expect(confirmDestructive("delete thing", "id-1", true)).resolves.toBeUndefined();
  });
});
