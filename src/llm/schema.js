import { z } from "zod";

const categoryEnum = z.enum(["billing", "bug", "feature", "other"]);

const urgencyEnum = z.enum(["low", "normal", "high"]);

const triageInputSchema = z.object({
  text: z.string().min(1).max(2000),
});

const triageOutputSchema = z.object({
  category: categoryEnum,
  urgency: urgencyEnum,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(300),
});

const STUB_RESPONSE = {
  category: "other",
  urgency: "normal",
  confidence: 0.9,
  reason: "This is a stub response for testing",
};

export { triageInputSchema, triageOutputSchema, categoryEnum, urgencyEnum, STUB_RESPONSE };
