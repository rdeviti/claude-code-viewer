import { describe, expect, test } from "vitest";
import { ModeEntrySchema } from "./ModeEntrySchema.ts";

describe("ModeEntrySchema", () => {
  test("accepts a mode entry emitted by newer Claude Code versions", () => {
    const result = ModeEntrySchema.safeParse({
      type: "mode",
      mode: "normal",
      sessionId: "9bb43739-21f2-45f2-bf3c-9270ba0dddca",
    });
    expect(result.success).toBe(true);
  });

  test("accepts arbitrary mode values", () => {
    const result = ModeEntrySchema.safeParse({
      type: "mode",
      mode: "plan",
      sessionId: "abc123",
    });
    expect(result.success).toBe(true);
  });

  test("rejects entries with a different type", () => {
    const result = ModeEntrySchema.safeParse({
      type: "permission-mode",
      mode: "normal",
      sessionId: "abc123",
    });
    expect(result.success).toBe(false);
  });

  test("rejects entries missing sessionId", () => {
    const result = ModeEntrySchema.safeParse({
      type: "mode",
      mode: "normal",
    });
    expect(result.success).toBe(false);
  });
});
