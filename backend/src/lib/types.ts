import { z } from "zod";

export const DateSearchResultSchema = z.object({
  found: z.boolean(),
  date: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  source: z.string().nullable(),
  title: z.string(),
  notes: z.string(),
});

export type DateSearchResult = z.infer<typeof DateSearchResultSchema>;

export interface Citation {
  url: string;
  snippet: string;
}

export interface BraveAnswerResult {
  answer: string;
  citations: Citation[];
}
