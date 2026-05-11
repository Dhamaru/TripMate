import { z } from "zod";

export const addCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("editor"),
});

export type AddCollaborator = z.infer<typeof addCollaboratorSchema>;
