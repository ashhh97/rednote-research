#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeXiaohongshu } from "../src/xiaohongshuScraper.js";
import { summarizeXhsNotes } from "../src/summarizeNotes.js";
import { loadLocalEnv } from "../src/localEnv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
loadLocalEnv(rootDir);
loadLocalEnv(path.resolve(rootDir, ".."));
loadLocalEnv(path.resolve(rootDir, "../.."));

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  printHelp();
  process.exit(0);
}
const keyword = args._[0] || args.keyword || "济州岛咖啡厅";
const maxNotes = Number(args.max || args.limit || 5);
const fetchDetails = args.details !== false;
const headless = args.show ? false : args.headless !== false;
const format = args.json ? "json" : "markdown";

const result = await scrapeXiaohongshu({
  keywords: [keyword],
  maxNotes,
  headless,
  debug: Boolean(args.debug),
  loginWaitMs: args.login ? Number(args.wait || 120000) : 0,
  fetchDetails,
  useAuth: args.auth !== false
});

const summary = await summarizeXhsNotes({
  keyword,
  notes: result.notes,
  useModel: args.model !== false
});

if (format === "json") {
  console.log(JSON.stringify({
    ok: true,
    keyword,
    maxNotes,
    fetchDetails,
    browserInfo: result.browserInfo,
    authStatus: result.authStatus,
    count: result.notes.length,
    warnings: result.warnings,
    diagnostics: result.diagnostics,
    networkDiagnostics: result.networkDiagnostics,
    notes: result.notes,
    summary
  }, null, 2));
} else {
  console.log(summary);
  if (result.warnings?.length) {
    console.log("\n## 采集提醒");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=");
    if (key.startsWith("no-")) {
      parsed[key.slice(3)] = false;
      continue;
    }
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      parsed[key] = coerceValue(inlineValue);
    } else if (next && !next.startsWith("--")) {
      parsed[key] = coerceValue(next);
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function coerceValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run search -- "关键词" --max=5 --details --show
  npm run search -- "关键词" --max=5 --details --json

Options:
  --max=5        Number of notes to collect
  --details      Open note detail pages and extract text/images
  --show         Show Chromium window
  --debug        Include diagnostics
  --login        Wait for manual login and save auth state
  --wait=120000  Login wait milliseconds
  --no-model     Use local extractive summary
  --json         Output structured JSON
`);
}
