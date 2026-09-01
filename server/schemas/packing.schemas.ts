import { z } from "zod";

export const createPackingListSchema = z.object({
  body: z.object({
    tripId: z.string().optional(),
    name: z.string().min(1, "Name is required"),
    season: z.string().optional(),
    items: z
      .array(
        z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1).default(1),
          category: z.string().optional(),
          is_mandatory: z.boolean().optional(),
        }),
      )
      .optional(),
    isTemplate: z.boolean().optional(),
  }),
});

export const createPackingListTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Template name is required"),
    items: z
      .array(
        z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1).default(1),
          category: z.string().optional(),
          is_mandatory: z.boolean().optional(),
        }),
      )
      .optional(),
  }),
});

export const updatePackingListSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Packing List ID is required"),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    season: z.string().optional(),
    items: z
      .array(
        z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1).default(1),
          category: z.string().optional(),
          is_mandatory: z.boolean().optional(),
          packed: z.boolean().optional(),
        }),
      )
      .optional(),
  }),
});

export const updatePackingItemSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Packing List ID is required"),
    itemId: z.string().min(1, "Item ID is required"),
  }),
  body: z.object({
    packed: z.boolean().optional(),
    quantity: z.number().int().min(1).optional(),
    name: z.string().optional(),
  }),
});
