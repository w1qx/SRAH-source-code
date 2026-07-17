import { z } from 'zod';

export const SendMessageSchema = z
  .object({
    /** Free text, a quick-reply value, or a speech-to-text transcript — all arrive as text. */
    message: z.string().trim().min(1).max(2000),
  })
  .strict();

export const ChatSessionParamSchema = z.object({ id: z.string().uuid() }).strict();
