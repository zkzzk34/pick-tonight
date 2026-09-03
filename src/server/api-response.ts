import type { ServerResponse } from "node:http";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export const API_ERRORS = {
  METHOD_NOT_ALLOWED: {
    statusCode: 405,
    code: "METHOD_NOT_ALLOWED",
    message: "The requested method is not supported.",
  },
  ROUTE_NOT_FOUND: {
    statusCode: 404,
    code: "ROUTE_NOT_FOUND",
    message: "The requested API route was not found.",
  },
} as const;

type ApiError = (typeof API_ERRORS)[keyof typeof API_ERRORS];

export function writeJsonResponse(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    ...headers,
  });
  response.end(`${JSON.stringify(body)}\n`);
}

export function writeApiError(
  response: ServerResponse,
  error: ApiError,
  headers: Readonly<Record<string, string>> = {},
): void {
  writeJsonResponse(
    response,
    error.statusCode,
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    headers,
  );
}
