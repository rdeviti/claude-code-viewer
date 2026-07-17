import { describe, expect, test } from "vitest";
import { LastPromptEntrySchema } from "./LastPromptEntrySchema.ts";

describe("LastPromptEntrySchema", () => {
  test("accepts valid last-prompt entry", () => {
    const result = LastPromptEntrySchema.safeParse({
      type: "last-prompt",
      lastPrompt: "Read docs/2026-03-12-phase-2-raise-only-hires.md...",
      sessionId: "28fc793f-fbe6-4062-8b4a-3d6e28f65b8b",
    });
    expect(result.success).toBe(true);
    const data = result.success ? result.data : undefined;
    expect(data?.type).toBe("last-prompt");
    expect(data?.lastPrompt).toBe("Read docs/2026-03-12-phase-2-raise-only-hires.md...");
    expect(data?.sessionId).toBe("28fc793f-fbe6-4062-8b4a-3d6e28f65b8b");
  });

  test("accepts leafUuid-only entries written by newer Claude Code versions", () => {
    const result = LastPromptEntrySchema.safeParse({
      type: "last-prompt",
      leafUuid: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      sessionId: "28fc793f-fbe6-4062-8b4a-3d6e28f65b8b",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing sessionId", () => {
    const result = LastPromptEntrySchema.safeParse({
      type: "last-prompt",
      lastPrompt: "Some prompt text",
    });
    expect(result.success).toBe(false);
  });

  test("rejects wrong type literal", () => {
    const result = LastPromptEntrySchema.safeParse({
      type: "not-last-prompt",
      lastPrompt: "Some prompt text",
      sessionId: "abc-123",
    });
    expect(result.success).toBe(false);
  });
});
