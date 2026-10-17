#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bridgeUrl = process.env.TRAVEL_RESEARCH_BRIDGE_URL || "http://127.0.0.1:8787";
const bridgeScript = path.join(rootDir, "projects/travel-discovery/bridge/server.js");
const runtimeDir = path.join(os.tmpdir(), "travel-research-bridge");
const logPath = path.join(runtimeDir, "bridge.log");
const pidPath = path.join(runtimeDir, "bridge.pid");

if (await isHealthy()) {
  console.log(JSON.stringify({ ok: true, started: false, url: bridgeUrl, message: "连接桥已经在运行。" }));
  process.exit(0);
}

fs.mkdirSync(runtimeDir, { recursive: true });
const log = fs.openSync(logPath, "a");
const child = spawn(process.execPath, [bridgeScript], {
  cwd: rootDir,
  detached: true,
  stdio: ["ignore", log, log],
  env: {
    ...process.env,
    TRAVEL_DISCOVERY_HEADLESS: "1",
    XHS_DISABLE_BROWSER_FALLBACK: "1",
    XHS_SEARCH_TIMEOUT_MS: process.env.XHS_SEARCH_TIMEOUT_MS || "15000"
  }
});
child.unref();
fs.writeFileSync(pidPath, `${child.pid}\n`);

for (let attempt = 0; attempt < 20; attempt += 1) {
  if (await isHealthy()) {
    console.log(JSON.stringify({ ok: true, started: true, pid: child.pid, url: bridgeUrl, logPath }));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.error(`连接桥启动后未通过健康检查，请查看日志：${logPath}`);
process.exit(1);

async function isHealthy() {
  try {
    const response = await fetch(`${bridgeUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
