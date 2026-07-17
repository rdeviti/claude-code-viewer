import { z } from "zod";

export const ModeEntrySchema = z.strictObject({
  type: z.literal("mode"),
  mode: z.string(),
  sessionId: z.string(),
});

export type ModeEntry = z.infer<typeof ModeEntrySchema>;
