import { describe, expect, test } from "vitest";
import { WorktreeStateEntrySchema } from "./WorktreeStateEntrySchema.ts";

describe("WorktreeStateEntrySchema", () => {
  test("accepts a worktree-state entry for a fresh worktree", () => {
    const result = WorktreeStateEntrySchema.safeParse({
      type: "worktree-state",
      sessionId: "abc123",
      worktreeSession: {
        sessionId: "abc123",
        originalCwd: "/repo",
        worktreePath: "/repo-feature",
        worktreeName: "repo-feature",
        worktreeBranch: "feature-branch",
        originalBranch: "main",
        originalHeadCommit: "deadbeef",
      },
    });
    expect(result.success).toBe(true);
  });

  test("accepts a worktree-state entry for an existing worktree", () => {
    const result = WorktreeStateEntrySchema.safeParse({
      type: "worktree-state",
      sessionId: "abc123",
      worktreeSession: {
        sessionId: "abc123",
        originalCwd: "/repo",
        worktreePath: "/repo-feature",
        worktreeName: "repo-feature",
        worktreeBranch: "feature-branch",
        enteredExisting: true,
      },
    });
    expect(result.success).toBe(true);
  });

  test("rejects entries with a different type", () => {
    const result = WorktreeStateEntrySchema.safeParse({
      type: "mode",
      sessionId: "abc123",
      worktreeSession: {
        sessionId: "abc123",
        originalCwd: "/repo",
        worktreePath: "/repo-feature",
        worktreeName: "repo-feature",
      },
    });
    expect(result.success).toBe(false);
  });
});
