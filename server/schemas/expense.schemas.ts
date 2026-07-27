import { z } from "zod";

export const addExpenseSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Trip ID is required"),
    }),
    body: z.object({
        amount: z.number().positive(),
        currency: z.string().min(1),
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
        currency: z.string().min(1).optional(),
        category: z.enum(["Accommodation", "Food", "Transport", "Activities", "Shopping", "Other"]).optional(),
        description: z.string().optional(),
        date: z.coerce.date().optional(),
    }),
});
