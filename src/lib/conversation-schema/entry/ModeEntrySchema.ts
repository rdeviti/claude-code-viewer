import { z } from "zod";

// "mode" entries record the active session mode (e.g. "normal").
// Distinct from "permission-mode" entries, which carry a `permissionMode` field.
export const ModeEntrySchema = z.strictObject({
  type: z.literal("mode"),
  mode: z.string(),
  sessionId: z.string(),
});

export type ModeEntry = z.infer<typeof ModeEntrySchema>;
