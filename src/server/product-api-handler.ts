import {
  HEALTH_API_PATH,
  RECOMMENDATIONS_API_PATH,
  TITLE_DETAILS_API_PREFIX,
} from "../shared/api-paths.ts";
import { productRecommendationRequestSchema } from "../shared/product-api-contracts.ts";
import {
  createProductRecommendations,
  createProductTitleDetail,
  type ProductApiServiceDependencies,
} from "./product-api-service.ts";
import { TmdbDiscoveryError } from "./tmdb-discovery-client.ts";

export const MAX_PRODUCT_API_BODY_BYTES = 32 * 1024;

export interface ProductApiRequestInput {
  readonly method: string | undefined;
  readonly requestTarget: string | undefined;
  readonly body?: string;
}

export interface ProductApiResult {
  readonly statusCode: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

const INTERNAL_ERROR = {
  error: {
    code: "INTERNAL_ERROR",
    message: "PickTonight could not complete the request.",
  },
} as const;

function errorResult(
  statusCode: number,
  code: string,
  message: string,
  headers?: Readonly<Record<string, string>>,
): ProductApiResult {
  return {
    statusCode,
    body: {
      error: {
        code,
        message,
      },
    },
    headers,
  };
}

function safeUrl(requestTarget: string | undefined): URL | null {
  try {
    return new URL(requestTarget ?? "/", "http://localhost");
  } catch {
    return null;
  }
}

function mapServiceError(error: unknown): ProductApiResult {
  if (!(error instanceof TmdbDiscoveryError)) {
    return {
      statusCode: 500,
      body: INTERNAL_ERROR,
    };
  }

  switch (error.code) {
    case "CONFIGURATION_ERROR":
      return errorResult(
        500,
        "SERVER_CONFIGURATION_ERROR",
        "PickTonight recommendation data is not configured.",
      );

    case "AUTHENTICATION_ERROR":
      return errorResult(
        502,
        "UPSTREAM_AUTHENTICATION_ERROR",
        "PickTonight could not authenticate with its recommendation data provider.",
      );

    case "NOT_FOUND":
      return errorResult(
        404,
        "TITLE_NOT_FOUND",
        "The requested title could not be found.",
      );

    case "RATE_LIMIT_ERROR":
      return errorResult(
        503,
        "UPSTREAM_RATE_LIMITED",
        "Recommendation data is temporarily busy. Try again shortly.",
      );

    case "UPSTREAM_TIMEOUT":
      return errorResult(
        504,
        "UPSTREAM_TIMEOUT",
        "Recommendation data took too long to respond. Try again.",
      );

    case "UPSTREAM_ERROR":
    case "INVALID_RESPONSE":
    case "NETWORK_ERROR":
      return errorResult(
        502,
        "UPSTREAM_ERROR",
        "Recommendation data is temporarily unavailable. Try again.",
      );
  }

  return {
    statusCode: 500,
    body: INTERNAL_ERROR,
  };
}

async function handleRecommendationRequest(
  body: string | undefined,
  dependencies: ProductApiServiceDependencies,
): Promise<ProductApiResult> {
  if (
    body === undefined ||
    body.length === 0 ||
    Buffer.byteLength(body, "utf8") > MAX_PRODUCT_API_BODY_BYTES
  ) {
    return errorResult(
      400,
      "INVALID_REQUEST",
      "The recommendation request is invalid.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResult(
      400,
      "INVALID_REQUEST",
      "The recommendation request is invalid.",
    );
  }

  const validation = productRecommendationRequestSchema.safeParse(parsed);

  if (!validation.success) {
    return errorResult(
      400,
      "INVALID_REQUEST",
      "The recommendation request is invalid.",
    );
  }

  try {
    const recommendations = await createProductRecommendations(
      validation.data,
      dependencies,
    );

    return {
      statusCode: 200,
      body: {
        data: {
          recommendations,
        },
      },
    };
  } catch (error) {
    return mapServiceError(error);
  }
}

function parseTitleRoute(
  pathname: string,
): { readonly mediaType: "movie" | "tv"; readonly id: number } | null {
  const escapedPrefix = TITLE_DETAILS_API_PREFIX.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const match = new RegExp(`^${escapedPrefix}/(movie|tv)/([1-9]\\d*)$`).exec(
    pathname,
  );

  if (match === null) {
    return null;
  }

  const mediaType = match[1];
  const id = Number(match[2]);

  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return { mediaType, id };
}

async function handleTitleRequest(
  url: URL,
  route: { readonly mediaType: "movie" | "tv"; readonly id: number },
  dependencies: ProductApiServiceDependencies,
): Promise<ProductApiResult> {
  const watchRegions = url.searchParams.getAll("watchRegion");

  if (watchRegions.length !== 1 || !/^[A-Z]{2}$/.test(watchRegions[0] ?? "")) {
    return errorResult(
      400,
      "INVALID_REQUEST",
      "The title-detail request is invalid.",
    );
  }

  try {
    const detail = await createProductTitleDetail(
      route.mediaType,
      route.id,
      watchRegions[0]!,
      dependencies,
    );

    return {
      statusCode: 200,
      body: {
        data: detail,
      },
    };
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function handleProductApiRequest(
  input: ProductApiRequestInput,
  dependencies: ProductApiServiceDependencies = {},
): Promise<ProductApiResult> {
  const url = safeUrl(input.requestTarget);

  if (url === null) {
    return errorResult(
      404,
      "ROUTE_NOT_FOUND",
      "The requested API route was not found.",
    );
  }

  if (url.pathname === HEALTH_API_PATH) {
    if (input.method !== "GET") {
      return errorResult(
        405,
        "METHOD_NOT_ALLOWED",
        "The requested method is not supported.",
        { Allow: "GET" },
      );
    }

    return {
      statusCode: 200,
      body: {
        data: {
          status: "ok",
        },
      },
    };
  }

  if (url.pathname === RECOMMENDATIONS_API_PATH) {
    if (input.method !== "POST") {
      return errorResult(
        405,
        "METHOD_NOT_ALLOWED",
        "The requested method is not supported.",
        { Allow: "POST" },
      );
    }

    return handleRecommendationRequest(input.body, dependencies);
  }

  const titleRoute = parseTitleRoute(url.pathname);

  if (titleRoute !== null) {
    if (input.method !== "GET") {
      return errorResult(
        405,
        "METHOD_NOT_ALLOWED",
        "The requested method is not supported.",
        { Allow: "GET" },
      );
    }

    return handleTitleRequest(url, titleRoute, dependencies);
  }

  return errorResult(
    404,
    "ROUTE_NOT_FOUND",
    "The requested API route was not found.",
  );
}
