import { z } from "zod";

export const addCollaboratorSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Trip ID is required"),
  }),
  body: z.object({
    email: z.string().email(),
    role: z.enum(["editor", "viewer"]).default("editor"),
  }),
});

export type AddCollaborator = z.infer<typeof addCollaboratorSchema>;
