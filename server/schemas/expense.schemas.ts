import { z } from "zod";

// ISO 4217 code. Anything else (free text like "rupees" on older expenses) is
// dropped so the trip's own currency applies, instead of failing the save.
const currency = z.preprocess((v) => {
  const code = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}, z.string().optional());

export const addExpenseSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Trip ID is required"),
  }),
  body: z.object({
    amount: z.number().positive(),
    currency,
    category: z.enum(["Accommodation", "Food", "Transport", "Activities", "Shopping", "Other"]),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
  }),
});

export const updateExpenseSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Trip ID is required"),
    expenseId: z.string().min(1, "Expense ID is required"),
  }),
  body: z.object({
    amount: z.number().positive().optional(),
    currency,
    category: z
      .enum(["Accommodation", "Food", "Transport", "Activities", "Shopping", "Other"])
      .optional(),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
  }),
});
