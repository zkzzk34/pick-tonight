import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { apiHandler } from "./index.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4_174;

export async function startLocalApiServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
}: {
  host?: string;
  port?: number;
} = {}): Promise<Server> {
  const server = createServer(apiHandler);

  await new Promise<void>((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(port, host, () => {
      server.off("error", rejectListening);
      resolveListening();
    });
  });

  return server;
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const server = await startLocalApiServer();
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("The local API server did not report a TCP address.");
  }

  console.log(
    `PickTonight API listening at http://${DEFAULT_HOST}:${address.port}`,
  );

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
