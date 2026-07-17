import { describe, expect, test } from "vitest";
import { AssistantMessageSchema } from "./AssistantMessageSchema.ts";

describe("AssistantMessageSchema", () => {
  test("accepts a regular assistant message", () => {
    const result = AssistantMessageSchema.safeParse({
      id: "msg_01",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "Hello" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        iterations: [],
        speed: "standard",
        inference_geo: "eu",
      },
    });
    expect(result.success).toBe(true);
  });

  test("accepts rate-limited error messages where usage fields are null", () => {
    // Newer Claude Code writes assistant entries for API errors (e.g.
    // "You've hit your session limit") with several usage fields set to null
    const result = AssistantMessageSchema.safeParse({
      id: "msg_02",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "You've hit your session limit" }],
      stop_reason: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        iterations: null,
        speed: null,
        inference_geo: null,
      },
    });
    expect(result.success).toBe(true);
  });
});
