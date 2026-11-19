import { z } from "zod";
import { PROPERTY_TYPES } from "@/lib/types";

export const ExecSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().email(),
  project_ids: z.array(z.string()).default([]),
  expertise: z.array(z.enum(PROPERTY_TYPES)).default([]),
  locations: z.array(z.string().trim().max(60)).default([]),
  available: z.boolean().default(true),
  active: z.boolean().default(true),
  daily_capacity: z.number().int().min(0).max(500).default(15),
});

export const ProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(120),
  property_type: z.enum(PROPERTY_TYPES),
  configurations: z.string().max(300).nullable().optional(),
  plot_dimensions: z.string().max(300).nullable().optional(),
  price_range: z.string().max(200).nullable().optional(),
  inventory: z.string().max(300).nullable().optional(),
  amenities: z.array(z.string().max(80)).default([]),
  specifications: z.string().max(4000).nullable().optional(),
  approvals: z.string().max(1000).nullable().optional(),
  faqs: z.array(z.object({ q: z.string().max(300), a: z.string().max(2000) })).default([]),
  sales_contact: z.string().max(200).nullable().optional(),
  instructions: z.string().max(2000).nullable().optional(),
  verified: z.boolean().default(false),
});
