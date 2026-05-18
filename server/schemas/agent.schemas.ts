import { z } from "zod";

export const agentMessageSchema = z.object({
    body: z.object({
        tripId: z.string().optional(),
        message: z.string().min(1, "Message is required"),
        context: z.record(z.any()).optional(),
    }),
});
