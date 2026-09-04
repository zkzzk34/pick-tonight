import * as z from "zod";

export const MEDIA_SUMMARY_TYPES = ["movie", "tv"] as const;

const positiveIdSchema = z.number().int().positive();

const nullableTextSchema = z.string().trim().min(1).nullable();
const nullableDateSchema = z.iso.date().nullable();

export const mediaSummarySchema = z.strictObject({
  source: z.literal("tmdb"),
  mediaType: z.enum(MEDIA_SUMMARY_TYPES),
  id: positiveIdSchema,
  title: z.string().trim().min(1),
  originalTitle: nullableTextSchema,
  overview: nullableTextSchema,
  releaseDate: nullableDateSchema,
  originalLanguage: nullableTextSchema,
  genreIds: z.array(positiveIdSchema),
  posterPath: nullableTextSchema,
  backdropPath: nullableTextSchema,
  popularity: z.number().finite().nonnegative().nullable(),
  voteAverage: z.number().finite().min(0).max(10).nullable(),
  voteCount: z.number().int().nonnegative().nullable(),
  adult: z.boolean().nullable(),
});

export type MediaSummary = z.infer<typeof mediaSummarySchema>;
