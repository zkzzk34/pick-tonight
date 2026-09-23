import { TITLE_DETAILS_API_PREFIX } from "../shared/api-paths.ts";
import {
  handleProductApiRequest,
  type ProductApiResult,
} from "./product-api-handler.ts";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

function toResponse(result: ProductApiResult): Response {
  return new Response(`${JSON.stringify(result.body)}\n`, {
    status: result.statusCode,
    headers: {
      ...JSON_HEADERS,
      ...(result.headers ?? {}),
    },
  });
}

export async function handleVercelRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text();

  return toResponse(
    await handleProductApiRequest({
      method,
      requestTarget: request.url,
      body,
    }),
  );
}

/**
 * Vercel rewrites:
 *
 *   /api/titles/:mediaType/:id -> /api/title
 *
 * Named rewrite parameters are passed through as query parameters. Rebuild
 * the platform-neutral PickTonight route before handing the request to the
 * shared product API handler.
 */
export async function handleVercelTitleRequest(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const mediaTypes = url.searchParams.getAll("mediaType");
  const ids = url.searchParams.getAll("id");

  const mediaType = mediaTypes.length === 1 ? (mediaTypes[0] ?? "") : "";
  const id = ids.length === 1 ? (ids[0] ?? "") : "";

  const target = new URL(
    `${TITLE_DETAILS_API_PREFIX}/${encodeURIComponent(mediaType)}/${encodeURIComponent(id)}`,
    url.origin,
  );

  for (const watchRegion of url.searchParams.getAll("watchRegion")) {
    target.searchParams.append("watchRegion", watchRegion);
  }

  return toResponse(
    await handleProductApiRequest({
      method: request.method.toUpperCase(),
      requestTarget: `${target.pathname}${target.search}`,
    }),
  );
}
