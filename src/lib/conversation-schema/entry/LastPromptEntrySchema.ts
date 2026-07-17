import { z } from "zod";

export const LastPromptEntrySchema = z.object({
  type: z.literal("last-prompt"),
  // Older entries carry the prompt text; newer ones may only reference the
  // leaf message by uuid. Some entries carry both.
  lastPrompt: z.string().optional(),
  leafUuid: z.string().optional(),
  sessionId: z.string(),
});

export type LastPromptEntry = z.infer<typeof LastPromptEntrySchema>;
