import * as http from "node:http";
import { pathToFileURL } from "node:url";
import { createAdminApp } from "./admin/create-admin-server";
import { createR2AdminClient, loadDashboardConfig } from "./admin/r2-admin-client";
import { loadLocalEnv } from "./local/load-local-env";

async function toRequest(request: http.IncomingMessage): Promise<Request> {
  const origin = `http://${request.headers.host ?? "localhost:3000"}`;
  const url = new URL(request.url ?? "/", origin);
  const method = request.method ?? "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }

    headers.set(key, value);
  }

  const body = method === "GET" || method === "HEAD"
    ? undefined
    : Buffer.concat(await readChunks(request));

  return new Request(url, {
    method,
    headers,
    body,
    duplex: "half",
  });
}

async function readChunks(stream: NodeJS.ReadableStream): Promise<Buffer[]> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks;
}

async function writeResponse(
  response: Response,
  serverResponse: http.ServerResponse,
): Promise<void> {
  serverResponse.statusCode = response.status;
  serverResponse.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    serverResponse.setHeader(key, value);
  });

  const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  serverResponse.end(body);
}

export async function startAdminDashboard(): Promise<http.Server> {
  loadLocalEnv();

  const config = loadDashboardConfig();
  const client = createR2AdminClient(config);
  const app = createAdminApp({ client, defaultPrefix: config.basePrefix });
  const server = http.createServer(async (request, response) => {
    try {
      await writeResponse(await app.fetch(await toRequest(request)), response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(`Dashboard error: ${message}`);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, resolve);
  });

  console.log(`R2 dashboard listening on http://localhost:${config.port}${config.basePrefix ? `/?prefix=${encodeURIComponent(config.basePrefix)}` : "/"}`);

  return server;
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  startAdminDashboard().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
