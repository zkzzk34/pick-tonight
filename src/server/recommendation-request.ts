import {
  INVALID_REQUEST_CODE,
  INVALID_REQUEST_MESSAGE,
  recommendationRequestSchema,
  type InvalidRecommendationRequestResponse,
  type RecommendationRequest,
  type RequestValidationIssue,
} from "../shared/recommendation-contracts.ts";

const MAX_REPORTED_VALIDATION_ISSUES = 20;

const KNOWN_REQUEST_PATH_SEGMENTS = new Set([
  "hardRestrictions",
  "mediaType",
  "excludedGenreIds",
  "maximumRuntimeMinutes",
  "requiredProviderIds",
  "softPreferences",
  "mood",
  "preferredGenreIds",
  "contentLanguage",
  "originCountry",
  "watchRegion",
]);

export type RecommendationRequestBodyParseResult =
  | {
      success: true;
      data: RecommendationRequest;
    }
  | {
      success: false;
      response: InvalidRecommendationRequestResponse;
    };

function mapIssueCode(
  code: string | undefined,
): RequestValidationIssue["code"] {
  switch (code) {
    case "invalid_type":
      return "INVALID_TYPE";
    case "invalid_value":
      return "UNSUPPORTED_VALUE";
    case "unrecognized_keys":
      return "UNKNOWN_FIELD";
    default:
      return "INVALID_VALUE";
  }
}

function sanitizeIssuePath(
  path: readonly PropertyKey[],
): RequestValidationIssue["path"] {
  const sanitizedPath: RequestValidationIssue["path"] = [];

  for (const segment of path) {
    if (
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0
    ) {
      sanitizedPath.push(segment);
      continue;
    }

    if (
      typeof segment === "string" &&
      KNOWN_REQUEST_PATH_SEGMENTS.has(segment)
    ) {
      sanitizedPath.push(segment);
      continue;
    }

    break;
  }

  return sanitizedPath;
}

function invalidRequest(
  issues: RequestValidationIssue[],
): RecommendationRequestBodyParseResult {
  const safeIssues =
    issues.length > 0 ? issues : [{ code: "INVALID_VALUE" as const, path: [] }];

  return {
    success: false,
    response: {
      error: {
        code: INVALID_REQUEST_CODE,
        message: INVALID_REQUEST_MESSAGE,
        issues: safeIssues,
      },
    },
  };
}

export function parseRecommendationRequestBody(
  body: string | undefined,
): RecommendationRequestBodyParseResult {
  if (body === undefined || body.trim().length === 0) {
    return invalidRequest([{ code: "MISSING_BODY", path: [] }]);
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(body);
  } catch {
    return invalidRequest([{ code: "MALFORMED_JSON", path: [] }]);
  }

  const validationResult = recommendationRequestSchema.safeParse(parsedBody);

  if (validationResult.success) {
    return {
      success: true,
      data: validationResult.data,
    };
  }

  const issues: RequestValidationIssue[] = validationResult.error.issues
    .slice(0, MAX_REPORTED_VALIDATION_ISSUES)
    .map((issue) => ({
      code: mapIssueCode(issue.code),
      path: sanitizeIssuePath(issue.path),
    }));

  return invalidRequest(issues);
}
