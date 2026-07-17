import { z } from "zod";

export const WorktreeStateEntrySchema = z.object({
  type: z.literal("worktree-state"),
  sessionId: z.string(),
  worktreeSession: z.object({
    sessionId: z.string(),
    originalCwd: z.string(),
    worktreePath: z.string(),
    worktreeName: z.string(),
    worktreeBranch: z.string().optional(),
    originalBranch: z.string().optional(),
    originalHeadCommit: z.string().optional(),
    enteredExisting: z.boolean().optional(),
  }),
});

export type WorktreeStateEntry = z.infer<typeof WorktreeStateEntrySchema>;
