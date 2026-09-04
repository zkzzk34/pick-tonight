import * as z from "zod";

export const MEDIA_TYPES = ["movie", "tv", "either"] as const;

export const SUPPORTED_MOODS = [
  "relaxed",
  "laughing",
  "excited",
  "thoughtful",
  "romantic",
  "spooked",
  "surprised",
] as const;

export const REQUEST_VALIDATION_ISSUE_CODES = [
  "MISSING_BODY",
  "MALFORMED_JSON",
  "INVALID_TYPE",
  "INVALID_VALUE",
  "UNSUPPORTED_VALUE",
  "UNKNOWN_FIELD",
] as const;

export const INVALID_REQUEST_CODE = "INVALID_REQUEST";
export const INVALID_REQUEST_MESSAGE = "The recommendation request is invalid.";

const positiveIdSchema = z.number().int().positive();

const uniquePositiveIdListSchema = z
  .array(positiveIdSchema)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length);

const requiredProviderIdListSchema = z
  .array(positiveIdSchema)
  .min(1)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length);

const contentLanguageSchema = z.string().regex(/^[a-z]{2}$/);
const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);

export const recommendationHardRestrictionsSchema = z.strictObject({
  mediaType: z.enum(MEDIA_TYPES).optional(),
  excludedGenreIds: uniquePositiveIdListSchema.optional(),
  maximumRuntimeMinutes: z.number().int().positive().optional(),
  requiredProviderIds: requiredProviderIdListSchema.optional(),
});

export const recommendationSoftPreferencesSchema = z.strictObject({
  mood: z.enum(SUPPORTED_MOODS).optional(),
  preferredGenreIds: uniquePositiveIdListSchema.optional(),
  contentLanguage: contentLanguageSchema.optional(),
  originCountry: countryCodeSchema.optional(),
});

export const recommendationRequestSchema = z
  .strictObject({
    hardRestrictions: recommendationHardRestrictionsSchema.optional(),
    softPreferences: recommendationSoftPreferencesSchema.optional(),
    watchRegion: countryCodeSchema.optional(),
  })
  .refine(
    ({ hardRestrictions, watchRegion }) =>
      hardRestrictions?.requiredProviderIds === undefined ||
      watchRegion !== undefined,
    { path: ["watchRegion"] },
  );

export type RecommendationHardRestrictions = z.infer<
  typeof recommendationHardRestrictionsSchema
>;

export type RecommendationSoftPreferences = z.infer<
  typeof recommendationSoftPreferencesSchema
>;

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const requestValidationIssueSchema = z.strictObject({
  code: z.enum(REQUEST_VALIDATION_ISSUE_CODES),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
});

export type RequestValidationIssue = z.infer<
  typeof requestValidationIssueSchema
>;

export const invalidRecommendationRequestResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal(INVALID_REQUEST_CODE),
    message: z.literal(INVALID_REQUEST_MESSAGE),
    issues: z.array(requestValidationIssueSchema).min(1),
  }),
});

export type InvalidRecommendationRequestResponse = z.infer<
  typeof invalidRecommendationRequestResponseSchema
>;

export function createRecommendationResponseSchema<
  TItemSchema extends z.ZodType,
>(itemSchema: TItemSchema) {
  return z.strictObject({
    data: z.strictObject({
      recommendations: z.array(itemSchema).max(3),
    }),
  });
}

export type RecommendationResponse<TItemSchema extends z.ZodType> = z.infer<
  ReturnType<typeof createRecommendationResponseSchema<TItemSchema>>
>;
