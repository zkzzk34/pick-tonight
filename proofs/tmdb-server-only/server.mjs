import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { fetchPopularMovie, TmdbProofError } from "./client.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4_173;
const STATIC_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; img-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const [indexHtml, browserJavaScript] = await Promise.all([
  readFile(new URL("./index.html", import.meta.url), "utf8"),
  readFile(new URL("./browser.js", import.meta.url), "utf8"),
]);

function send(response, statusCode, contentType, body, additionalHeaders = {}) {
  response.writeHead(statusCode, {
    ...STATIC_HEADERS,
    ...additionalHeaders,
    "Content-Type": contentType,
  });
  response.end(body);
}

function sendJson(response, statusCode, payload, additionalHeaders = {}) {
  send(
    response,
    statusCode,
    "application/json; charset=utf-8",
    `${JSON.stringify(payload)}\n`,
    additionalHeaders,
  );
}

function publicError(error) {
  if (!(error instanceof TmdbProofError)) {
    return {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "The proof request could not be completed.",
    };
  }

  const statusCodes = {
    AUTHENTICATION_ERROR: 502,
    CONFIGURATION_ERROR: 500,
    INVALID_RESPONSE: 502,
    NETWORK_ERROR: 502,
    NO_RESULTS: 502,
    UPSTREAM_ERROR: 502,
    UPSTREAM_TIMEOUT: 504,
  };

  return {
    statusCode: statusCodes[error.code] ?? 500,
    code: error.code ?? "INTERNAL_ERROR",
    message: error.message,
  };
}

export function createProofServer({ token, fetchImpl, timeoutMs } = {}) {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method !== "GET") {
      sendJson(
        response,
        405,
        {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "This proof accepts GET requests only.",
          },
        },
        { Allow: "GET" },
      );
      return;
    }

    if (requestUrl.pathname === "/") {
      send(response, 200, "text/html; charset=utf-8", indexHtml);
      return;
    }

    if (requestUrl.pathname === "/proof.js") {
      send(response, 200, "text/javascript; charset=utf-8", browserJavaScript);
      return;
    }

    if (requestUrl.pathname === "/api/tmdb-proof") {
      try {
        const movie = await fetchPopularMovie({ token, fetchImpl, timeoutMs });
        sendJson(response, 200, { movie });
      } catch (error) {
        const safeError = publicError(error);
        sendJson(response, safeError.statusCode, {
          error: {
            code: safeError.code,
            message: safeError.message,
          },
        });
      }
      return;
    }

    sendJson(response, 404, {
      error: {
        code: "NOT_FOUND",
        message: "The requested proof resource does not exist.",
      },
    });
  });
}

export async function startProofServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  token,
  fetchImpl,
  timeoutMs,
} = {}) {
  const server = createProofServer({ token, fetchImpl, timeoutMs });

  await new Promise((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(port, host, () => {
      server.off("error", rejectListening);
      resolveListening();
    });
  });

  return server;
}

function configuredPort(value) {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TMDB_PROOF_PORT must be an integer from 1 through 65535.");
  }

  return port;
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const host = DEFAULT_HOST;
  const port = configuredPort(process.env.TMDB_PROOF_PORT);
  const server = await startProofServer({ host, port });

  console.log(`TMDB server-only proof listening at http://${host}:${port}`);
  console.log("The API Read Access Token remains in the Node server process.");

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
