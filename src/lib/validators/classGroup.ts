import { z } from "zod";
import { Program } from "@prisma/client";

export const createClassGroupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a class group name, e.g. BSIT 4A")
      .max(60, "Keep the name under 60 characters"),
    program: z.enum(Program),
    classType: z.string().trim().min(1).max(40).default("Regular"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "The end date must be after the start date",
    path: ["endDate"],
  });

export const renameClassGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a class group name, e.g. BSIT 4A")
    .max(60, "Keep the name under 60 characters"),
});

export const assignAdviserSchema = z.object({
  facultyId: z.uuid("Choose a faculty adviser"),
  semesterId: z.uuid("Choose a semester"),
});
