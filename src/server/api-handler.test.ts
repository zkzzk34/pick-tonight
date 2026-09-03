import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { startLocalApiServer } from "./local.ts";

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startTestApiServer(): Promise<{
  origin: string;
  server: Server;
}> {
  const server = await startLocalApiServer({ port: 0 });
  const address = server.address();

  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  if (address === null || typeof address === "string") {
    throw new Error("The test server did not report a TCP address.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
  };
}

function assertJsonResponseHeaders(response: Response): void {
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("GET /api/health returns a fixed operational response", async (t) => {
  const requestSecret = "health-query-secret-that-must-not-be-reflected";
  const { origin, server } = await startTestApiServer();
  t.after(() => closeServer(server));

  const response = await fetch(`${origin}/api/health?debug=${requestSecret}`, {
    headers: {
      "X-Test-Secret": requestSecret,
    },
  });
  const responseText = await response.text();

  assert.equal(response.status, 200);
  assertJsonResponseHeaders(response);
  assert.deepEqual(JSON.parse(responseText), {
    data: {
      status: "ok",
    },
  });
  assert.equal(responseText.includes(requestSecret), false);
});

test("unsupported health methods return one safe error contract", async (t) => {
  const requestSecret = "method-secret-that-must-not-be-reflected";
  const { origin, server } = await startTestApiServer();
  t.after(() => closeServer(server));

  const response = await fetch(`${origin}/api/health`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-Test-Secret": requestSecret,
    },
    body: requestSecret,
  });
  const responseText = await response.text();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assertJsonResponseHeaders(response);
  assert.deepEqual(JSON.parse(responseText), {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "The requested method is not supported.",
    },
  });
  assert.equal(responseText.includes(requestSecret), false);
});

test("unknown API routes return one safe error contract", async (t) => {
  const requestSecret = "route-secret-that-must-not-be-reflected";
  const { origin, server } = await startTestApiServer();
  t.after(() => closeServer(server));

  const response = await fetch(
    `${origin}/api/${requestSecret}?debug=${requestSecret}`,
    {
      headers: {
        "X-Test-Secret": requestSecret,
      },
    },
  );
  const responseText = await response.text();

  assert.equal(response.status, 404);
  assertJsonResponseHeaders(response);
  assert.deepEqual(JSON.parse(responseText), {
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested API route was not found.",
    },
  });
  assert.equal(responseText.includes(requestSecret), false);
});
