#!/usr/bin/env node
import http from "node:http";
import { searchTravelSourcesForSkill } from "../../../src/research/skillConnector.js";
import { loadLocalEnv } from "../../../src/localEnv.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../../..");
loadLocalEnv(rootDir);
loadLocalEnv(path.resolve(rootDir, "projects/xhs-automation"));

const port = Number(process.env.TRAVEL_RESEARCH_BRIDGE_PORT || 8787);
const host = process.env.TRAVEL_RESEARCH_BRIDGE_HOST || "127.0.0.1";
process.env.TRAVEL_DISCOVERY_HEADLESS = "1";
process.env.XHS_DISABLE_BROWSER_FALLBACK = "1";
process.env.XHS_SEARCH_TIMEOUT_MS = process.env.XHS_SEARCH_TIMEOUT_MS || "15000";

if (process.argv.includes("--help")) {
  console.log(`Travel Research Bridge\n\nListening on http://${host}:${port}\n\nEndpoints:\n  GET  /health\n  POST /search  JSON body: { destination, mode, days, preferences, maxNotes, webPerDimension }\n`);
  process.exit(0);
}

const server = http.createServer(async (request, response) => {
  setJsonHeaders(response);

  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ ok: true, service: "travel-research-bridge", headless: true }));
    return;
  }

  if (request.method !== "POST" || request.url !== "/search") {
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: "Not found" }));
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ ok: false, error: `Invalid JSON: ${error.message}` }));
    return;
  }

  response.setHeader("transfer-encoding", "chunked");
  const send = (event) => response.write(`${JSON.stringify(event)}\n`);
  send({ type: "started", service: "travel-research-bridge", headless: true });

  try {
    const result = await searchTravelSourcesForSkill({
      destination: body.destination,
      days: body.days,
      preferences: body.preferences,
      maxNotes: Number(body.maxNotes || 6),
      webPerDimension: Number(body.webPerDimension || 4),
      mode: body.mode || "discovery",
      headless: true,
      onProgress: (message) => send({ type: "progress", message, at: new Date().toISOString() })
    });
    send({ type: "result", data: result });
  } catch (error) {
    send({
      type: "result",
      data: {
        contractVersion: "travel-research.v1",
        adapter: "localhost-bridge",
        ok: false,
        error: error?.stack || error?.message || String(error)
      }
    });
  } finally {
    response.end();
  }
});

server.on("error", (error) => {
  console.error(`连接桥启动失败：${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Travel Research Bridge listening on http://${host}:${port}`);
});

function setJsonHeaders(response) {
  response.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  response.setHeader("cache-control", "no-store");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) request.destroy(new Error("Request too large"));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
