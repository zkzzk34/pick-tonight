import type { IncomingMessage, ServerResponse } from "node:http";

import { writeJsonResponse } from "./api-response.ts";
import {
  handleProductApiRequest,
  MAX_PRODUCT_API_BODY_BYTES,
} from "./product-api-handler.ts";

const MAX_LOCAL_REQUEST_BODY_BYTES = MAX_PRODUCT_API_BODY_BYTES + 1;

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(
  request: IncomingMessage,
): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    totalBytes += buffer.length;

    if (totalBytes > MAX_LOCAL_REQUEST_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function apiHandler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readRequestBody(request);

    const result = await handleProductApiRequest({
      method: request.method,
      requestTarget: request.url,
      body,
    });

    writeJsonResponse(
      response,
      result.statusCode,
      result.body,
      result.headers ?? {},
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      writeJsonResponse(response, 413, {
        error: {
          code: "REQUEST_TOO_LARGE",
          message: "The API request is too large.",
        },
      });
      return;
    }

    writeJsonResponse(response, 500, {
      error: {
        code: "INTERNAL_ERROR",
        message: "PickTonight could not complete the request.",
      },
    });
  }
}
