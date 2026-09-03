import type { IncomingMessage, ServerResponse } from "node:http";

import { HEALTH_API_PATH } from "../shared/api-paths.ts";
import {
  API_ERRORS,
  writeApiError,
  writeJsonResponse,
} from "./api-response.ts";

const HEALTH_RESPONSE = {
  data: {
    status: "ok",
  },
} as const;

function readPathname(requestTarget: string | undefined): string {
  try {
    return new URL(requestTarget ?? "/", "http://localhost").pathname;
  } catch {
    return "";
  }
}

export function apiHandler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (readPathname(request.url) !== HEALTH_API_PATH) {
    writeApiError(response, API_ERRORS.ROUTE_NOT_FOUND);
    return;
  }

  if (request.method !== "GET") {
    writeApiError(response, API_ERRORS.METHOD_NOT_ALLOWED, {
      Allow: "GET",
    });
    return;
  }

  writeJsonResponse(response, 200, HEALTH_RESPONSE);
}
