import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { startLocalApiServer } from "./local.ts";

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("the API foundation returns a fixed response without reflecting request details", async (t) => {
  const requestSecret = "test-request-secret-that-must-not-be-reflected";
  const server = await startLocalApiServer({ port: 0 });
  t.after(() => closeServer(server));

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  if (address === null || typeof address === "string") {
    throw new Error("The test server did not report a TCP address.");
  }

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api?debug=${requestSecret}`,
    {
      headers: {
        "X-Test-Secret": requestSecret,
      },
    },
  );
  const responseText = await response.text();

  assert.equal(response.status, 501);
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(JSON.parse(responseText), {
    error: {
      message: "API routes are not available yet.",
    },
  });
  assert.equal(responseText.includes(requestSecret), false);
});
