import * as z from "zod";

import { MEDIA_SUMMARY_TYPES } from "./media-contracts.ts";
import {
  recommendationExplanationSchema,
  recommendationRequestSchema,
} from "./recommendation-contracts.ts";
import {
  RECOMMENDATION_CANDIDATE_AGE_CODES,
  RECOMMENDATION_RATING_CONFIDENCE_CODES,
} from "./recommendation-evidence.ts";

export const PRODUCT_RECOMMENDATION_COUNTS = [1, 3] as const;

export const productMediaKeySchema = z
  .string()
  .regex(/^(?:movie|tv):[1-9]\d*$/);

const productSessionExclusionsSchema = z.strictObject({
  shownMediaKeys: z.array(productMediaKeySchema).max(100).optional(),
  removedMediaKeys: z.array(productMediaKeySchema).max(100).optional(),
});

export const productRecommendationRequestSchema = z.strictObject({
  request: recommendationRequestSchema,
  requestedCount: z.union([z.literal(1), z.literal(3)]),
  exclusions: productSessionExclusionsSchema.optional(),
});

export type ProductRecommendationRequest = z.infer<
  typeof productRecommendationRequestSchema
>;

export const productRuntimeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("movie"),
    minutes: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal("episode"),
    minutes: z.number().int().positive(),
  }),
]);

export const PRODUCT_DISPLAY_RATING_CONFIDENCE = [
  "none",
  "low",
  "medium",
  "established",
  "high",
] as const;

const productRatingSchema = z
  .strictObject({
    average: z.number().finite().min(0).max(10),
    voteCount: z.number().int().nonnegative().nullable(),
    confidence: z.enum(PRODUCT_DISPLAY_RATING_CONFIDENCE),
  })
  .nullable();

const productFreshnessSchema = z
  .strictObject({
    label: z.string().trim().min(1),
    basis: z.enum([
      "release-date",
      "first-air-date",
      "now-playing",
      "on-the-air",
    ]),
  })
  .nullable();

const productCardProviderAvailabilitySchema = z
  .strictObject({
    source: z.literal("justwatch"),
    watchRegion: z.string().regex(/^[A-Z]{2}$/),
    providerNames: z.array(z.string().trim().min(1)),
  })
  .nullable();

export const productRecommendationSchema = z.strictObject({
  mediaKey: productMediaKeySchema,
  title: z.string().trim().min(1),
  year: z.number().int().positive().nullable(),
  mediaType: z.enum(MEDIA_SUMMARY_TYPES),
  decisionEvidence: z.strictObject({
    candidateAgeCode: z.enum(RECOMMENDATION_CANDIDATE_AGE_CODES),
    ratingConfidenceCode: z.enum(RECOMMENDATION_RATING_CONFIDENCE_CODES),
  }),
  overview: z.string().trim().min(1).nullable(),
  posterUrl: z.url().startsWith("https://").nullable(),
  genres: z.array(z.string().trim().min(1)),
  runtime: productRuntimeSchema.nullable(),
  rating: productRatingSchema,
  freshness: productFreshnessSchema,
  providerAvailability: productCardProviderAvailabilitySchema,
  trailerUrl: z.url().startsWith("https://").nullable(),
  explanation: recommendationExplanationSchema,
});

export type ProductRecommendation = z.infer<typeof productRecommendationSchema>;

export const productRecommendationResponseSchema = z.strictObject({
  data: z.strictObject({
    recommendations: z.array(productRecommendationSchema).max(3),
  }),
});

export type ProductRecommendationResponse = z.infer<
  typeof productRecommendationResponseSchema
>;

const productTitleProviderAvailabilitySchema = z
  .strictObject({
    source: z.literal("justwatch"),
    watchRegion: z.string().regex(/^[A-Z]{2}$/),
    tmdbUrl: z.url().startsWith("https://").nullable(),
    streaming: z.array(z.string().trim().min(1)),
    free: z.array(z.string().trim().min(1)),
    ads: z.array(z.string().trim().min(1)),
    rent: z.array(z.string().trim().min(1)),
    buy: z.array(z.string().trim().min(1)),
  })
  .nullable();

export const productTitleDetailSchema = z.strictObject({
  mediaKey: productMediaKeySchema,
  title: z.string().trim().min(1),
  year: z.number().int().positive().nullable(),
  mediaType: z.enum(MEDIA_SUMMARY_TYPES),
  overview: z.string().trim().min(1).nullable(),
  posterUrl: z.url().startsWith("https://").nullable(),
  genres: z.array(z.string().trim().min(1)),
  runtime: productRuntimeSchema.nullable(),
  rating: productRatingSchema,
  freshness: productFreshnessSchema,
  watchRegion: z.string().regex(/^[A-Z]{2}$/),
  providerAvailability: productTitleProviderAvailabilitySchema,
  trailerUrl: z.url().startsWith("https://").nullable(),
});

export type ProductTitleDetail = z.infer<typeof productTitleDetailSchema>;

export const productTitleDetailResponseSchema = z.strictObject({
  data: productTitleDetailSchema,
});

export type ProductTitleDetailResponse = z.infer<
  typeof productTitleDetailResponseSchema
>;
