#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../../../src/localEnv.js";
import { searchTravelSourcesForSkill } from "../../../src/research/skillConnector.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../../..");
loadLocalEnv(rootDir);
loadLocalEnv(path.resolve(rootDir, "projects/xhs-automation"));

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.destination) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

let result;
try {
  result = await searchTravelSourcesForSkill({
    destination: args.destination,
    days: args.days,
    preferences: args.preferences,
    maxNotes: Number(args.maxNotes || 6),
    webPerDimension: Number(args.webPerDimension || 4),
    // Skill runs in Codex's process environment; visible Chromium belongs to the local web app.
    headless: true,
    mode: args.mode || "discovery",
    onProgress: (message) => emitProgress(message, Boolean(args.stream))
  });
} catch (error) {
  const failure = {
    contractVersion: "travel-research.v1",
    adapter: "skill",
    ok: false,
    error: error?.stack || error?.message || String(error)
  };
  if (args.stream) {
    process.stdout.write(`${JSON.stringify({ type: "result", data: failure })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  }
  process.exitCode = 1;
  process.exit();
}
if (args.stream) {
  process.stdout.write(`${JSON.stringify({ type: "result", data: result })}\n`);
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=");
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith("--")) index += 1;
    result[key] = value === undefined ? true : value;
  }
  return result;
}

function printHelp() {
  console.log(`Usage:
  node projects/travel-discovery/scripts/search.js --destination "花鸟岛" --mode discovery

Options:
  --destination       Destination, required
  --mode discovery    Candidate-place pass; use full for all dimensions
  --days 3            Trip duration
  --preferences       Interests, for example 海边、拍照、咖啡
  --maxNotes 6        Xiaohongshu notes per selected dimension
  --webPerDimension 4 Web pages per selected dimension
  --stream            Emit one JSON progress event per line, then a result event

Environment:
  XHS_AUTH_DIR=xhs-auth-test
  XHS_WEB_ORIGIN=https://www.rednote.com
  PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers
`);
}

function emitProgress(message, stream) {
  if (stream) {
    process.stdout.write(`${JSON.stringify({ type: "progress", message, at: new Date().toISOString() })}\n`);
    return;
  }
  process.stderr.write(`[travel-discovery] ${message}\n`);
}
