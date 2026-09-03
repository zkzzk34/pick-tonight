import type { IncomingMessage, ServerResponse } from "node:http";

const NOT_IMPLEMENTED_BODY = `${JSON.stringify({
  error: {
    message: "API routes are not available yet.",
  },
})}\n`;

export function apiHandler(
  _request: IncomingMessage,
  response: ServerResponse,
): void {
  response.writeHead(501, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(NOT_IMPLEMENTED_BODY);
}
