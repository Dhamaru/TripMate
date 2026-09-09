import { z } from "zod";

export const signInSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    remember: z.boolean().optional(),
    device: z.string().optional(),
  }),
});

// No password field — self-serve email/password account creation is a
// two-step flow now (see auth.controller.ts's signup): submit email here,
// confirm via emailed link, set a password on /reset-password.
export const signUpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    device: z.string().optional(),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});
