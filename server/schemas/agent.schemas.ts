import { z } from "zod";

export const agentMessageSchema = z.object({
    body: z.object({
        tripId: z.string().min(1, "Trip ID is required"),
        message: z.string().min(1, "Message is required"),
        context: z.record(z.any()).optional(),
    }),
});
