#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "../../src/localEnv.js";
import { scrapeXiaohongshu } from "../../src/xiaohongshuScraper.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");
loadLocalEnv(rootDir);
loadLocalEnv(path.resolve(rootDir, "projects/xhs-automation"));

const PROTOCOL_VERSION = "2024-11-05";
const execFileAsync = promisify(execFile);
const IMAGE_CACHE_DIR = path.join(os.tmpdir(), "travel-research-mcp-images");
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
let initialized = false;

process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    handleMessage(line).catch((error) => writeError(null, -32603, error.message));
  }
});

process.on("uncaughtException", (error) => {
  console.error(`[travel-research-mcp] ${error.stack || error.message}`);
});

async function handleMessage(line) {
  const message = JSON.parse(line);
  if (message.method === "notifications/initialized") {
    initialized = true;
    return;
  }
  if (message.method === "notifications/cancelled") return;
  if (message.method === "initialize") {
    initialized = true;
    writeResult(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "travel-research-mcp", version: "0.1.0" },
      instructions: "Uses local Playwright and the user's local Rednote/Xiaohongshu session. It never fabricates unavailable note details or metrics."
    });
    return;
  }
  if (message.method === "ping") {
    writeResult(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    writeResult(message.id, { tools: toolDefinitions() });
    return;
  }
  if (message.method === "tools/call") {
    const result = await callTool(message.params?.name, message.params?.arguments || {}, message.params?._meta);
    writeResult(message.id, result);
    return;
  }
  if (message.id !== undefined) writeError(message.id, -32601, `Unknown method: ${message.method}`);
}

function toolDefinitions() {
  return [
    {
      name: "xhs_search",
      description: "Search Rednote/Xiaohongshu and open note details. Returns titles, URLs, authors, engagement metrics, images, detail text, auth status, warnings, and diagnostics.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword, for example 花鸟岛攻略" },
          maxNotes: { type: "number", description: "Maximum candidate notes to return before quality selection", default: 15 },
          fetchDetails: { type: "boolean", description: "Open note details when available", default: true },
          headless: { type: "boolean", description: "Run Chromium headless", default: true },
          imageLimit: { type: "number", description: "Images to render per note", default: 3 }
        },
        required: ["keyword"]
      }
    },
    {
      name: "xhs_search_batch",
      description: "Run several Rednote/Xiaohongshu searches for a destination and return a deduplicated note set.",
      inputSchema: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" }, description: "Search keywords" },
          maxNotes: { type: "number", default: 15 },
          fetchDetails: { type: "boolean", default: true },
          headless: { type: "boolean", default: true },
          imageLimit: { type: "number", description: "Representative original note images to render", default: 3 }
        },
        required: ["keywords"]
      }
    },
    {
      name: "xhs_place_images",
      description: "Search each named place separately and return at most one matched note image per place. Use after a discovery pass has identified candidate places.",
      inputSchema: {
        type: "object",
        properties: {
          destination: { type: "string", description: "Destination name, for example 深圳" },
          places: { type: "array", items: { type: "string" }, description: "Named places to match individually; maximum 12" },
          headless: { type: "boolean", default: true }
        },
        required: ["destination", "places"]
      }
    },
    {
      name: "xhs_login_status",
      description: "Check whether a local Xiaohongshu/Rednote storage state file exists. Use xhs_search for an authoritative in-page auth status.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "xhs_login",
      description: "Open a visible local Playwright browser and wait for the user to complete Xiaohongshu/Rednote login. Use only when the user explicitly asks to log in.",
      inputSchema: {
        type: "object",
        properties: {
          waitMs: { type: "number", description: "Maximum login wait in milliseconds", default: 180000 }
        }
      }
    }
  ];
}

async function callTool(name, args, meta) {
  if (name === "xhs_login_status") return loginStatus();
  if (name === "xhs_login") return runLogin({ waitMs: Number(args.waitMs || 180000), progressToken: meta?.progressToken });
  if (name === "xhs_search") {
    return runSearch({
      keywords: [String(args.keyword || "").trim()],
      maxNotes: Number(args.maxNotes || 15),
      fetchDetails: args.fetchDetails !== false,
      headless: args.headless !== false,
      imageLimit: clampImageLimit(args.imageLimit ?? 3),
      progressToken: meta?.progressToken
    });
  }
  if (name === "xhs_search_batch") {
    const keywords = Array.isArray(args.keywords) ? args.keywords.map(String).filter(Boolean) : [];
    return runSearch({
      keywords,
      maxNotes: Number(args.maxNotes || 15),
      fetchDetails: args.fetchDetails !== false,
      headless: args.headless !== false,
      imageLimit: clampImageLimit(args.imageLimit ?? 3),
      progressToken: meta?.progressToken
    });
  }
  if (name === "xhs_place_images") {
    const places = Array.isArray(args.places)
      ? Array.from(new Set(args.places.map((place) => String(place).trim()).filter(Boolean))).slice(0, 12)
      : [];
    return runPlaceImages({
      destination: String(args.destination || "").trim(),
      places,
      headless: args.headless !== false,
      progressToken: meta?.progressToken
    });
  }
  return errorResult(`Unknown tool: ${name}`);
}

async function runLogin({ waitMs, progressToken }) {
  sendProgress(progressToken, 0, 1, "正在打开本机浏览器，请在小红书页面完成登录。");
  const result = await scrapeXiaohongshu({
    keywords: ["旅行攻略"],
    maxNotes: 1,
    headless: false,
    fetchDetails: false,
    loginWaitMs: Math.max(30000, Math.min(waitMs, 300000)),
    debug: process.env.XHS_MCP_DEBUG === "1",
    onProgress: async (event) => {
      if (event.type === "detail") sendProgress(progressToken, event.index, event.total, `正在读取登录后的页面：${event.title}`);
    }
  });
  sendProgress(progressToken, 1, 1, result.authStatus?.loggedIn ? "小红书登录态已保存。" : "仍未检测到有效登录态。");
  return textResult({
    authStatus: result.authStatus,
    browserInfo: result.browserInfo,
    warnings: result.warnings,
    diagnostics: result.diagnostics
  });
}

async function runSearch({ keywords, maxNotes, fetchDetails, headless, imageLimit, progressToken }) {
  if (!keywords.length) return errorResult("At least one keyword is required");
  const result = await scrapeXiaohongshu({
    keywords,
    maxNotes,
    headless,
    fetchDetails,
    debug: process.env.XHS_MCP_DEBUG === "1",
    onProgress: async (event) => {
      if (event.type === "selection") {
        sendProgress(
          progressToken,
          event.index,
          event.total,
          `已筛选详情笔记 ${event.index}/${event.total}：${event.title}（${event.reasons?.join("、") || "可用"}）`
        );
      }
      if (event.type === "detail") {
        sendProgress(progressToken, event.index, event.total, `正在阅读小红书笔记 ${event.index}/${event.total}：${event.title}`);
      }
    }
  });
  return await multimodalResult(compactResult(result, imageLimit), imageLimit);
}

async function runPlaceImages({ destination, places, headless, progressToken }) {
  if (!destination) return errorResult("destination is required");
  if (!places.length) return errorResult("At least one place is required");

  const matches = [];
  const content = [];
  const warnings = [];
  let browserInfo = null;
  let authStatus = null;

  const concurrency = 2;
  for (let start = 0; start < places.length; start += concurrency) {
    const group = places.slice(start, start + concurrency);
    const groupResults = await Promise.all(group.map((place, offset) => {
      const index = start + offset;
      sendProgress(progressToken, index, places.length, `正在为地点匹配图片 ${index + 1}/${places.length}：${place}`);
      return collectPlaceImage({ destination, place, headless });
    }));
    for (const item of groupResults) {
      browserInfo = item.browserInfo || browserInfo;
      authStatus = item.authStatus || authStatus;
      warnings.push(...item.warnings);
      matches.push(item.match);
      content.push(...item.content);
    }
    sendProgress(progressToken, Math.min(start + group.length, places.length), places.length, `已完成 ${Math.min(start + group.length, places.length)}/${places.length} 个地点图片匹配。`);
  }

  sendProgress(progressToken, places.length, places.length, "地点图片匹配完成。");
  return {
    content: [
      { type: "text", text: JSON.stringify({ destination, matches, browserInfo, authStatus, warnings }, null, 2) },
      ...content
    ]
  };
}

async function collectPlaceImage({ destination, place, headless }) {
  const keyword = `${destination} ${place}`;
  const result = await scrapeXiaohongshu({
    keywords: [keyword],
    maxNotes: 1,
    headless,
    fetchDetails: false,
    debug: process.env.XHS_MCP_DEBUG === "1"
  });
  const visual = await multimodalResult(compactResult(result, 1), 1);
  const jsonText = visual.content.find((item) => item.type === "text")?.text || "{}";
  let compact = {};
  try { compact = JSON.parse(jsonText); } catch { compact = {}; }
  const note = compact.notes?.[0] || null;
  const content = visual.content.slice(1).map((item) => item.type === "text"
    ? { type: "text", text: `地点：${place}\n${item.text}` }
    : item);
  return {
    match: { place, keyword, note, imagePaths: note?.imagePaths || [] },
    content,
    browserInfo: result.browserInfo || null,
    authStatus: result.authStatus || null,
    warnings: result.warnings || []
  };
}

function loginStatus() {
  const authDir = path.resolve(process.env.XHS_AUTH_DIR || "xhs-auth");
  return textResult({
    authDir,
    storageStatePath: path.join(authDir, "storage-state.json"),
    note: "文件存在不代表当前会话仍有效；请使用 xhs_search 查看 authStatus。"
  });
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function multimodalResult(result, imageLimit) {
  await cleanupImageCache();
  const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  const imageDiagnostics = [];
  for (const note of result.notes || []) {
    let added = 0;
    const imagePaths = [];
    for (const imageUrl of note._imageUrls || []) {
      if (added >= imageLimit) break;
      let image;
      try {
        image = await fetchImage(imageUrl);
      } catch (error) {
        imageDiagnostics.push({ note: note.title || "", stage: "fetch", message: error.message });
        continue;
      }
      let imagePath = null;
      try {
        imagePath = await cacheImage(image, note.title, added + 1);
      } catch (error) {
        imageDiagnostics.push({ note: note.title || "", stage: "cache", message: error.message });
      }
      if (imagePath) imagePaths.push(imagePath);
      content.push({
        type: "text",
        text: imagePath
          ? `笔记图片文件：${imagePath}\n最终回复请用 Markdown 直接渲染这个本机文件，不要使用小红书 CDN 图片地址。`
          : `笔记图片：${note.title || "未命名笔记"}（${added + 1}/${imageLimit}）`
      });
      content.push({ type: "image", data: image.data, mimeType: image.mimeType });
      added += 1;
      if (added >= imageLimit) break;
    }
    note.imagePaths = imagePaths;
    delete note._imageUrls;
  }
  result.imageDiagnostics = imageDiagnostics;
  content[0] = { type: "text", text: JSON.stringify(result, null, 2) };
  return { content };
}

function compactResult(result, imageLimit) {
  return {
    notes: (result.notes || []).map((note) => ({
      title: note.title || "",
      url: note.url || "",
      keyword: note.keyword || "",
      author: note.author || "",
      stats: note.stats || {},
      tags: note.tags || [],
      ipLocation: note.ipLocation || "",
      imageCount: (note.images || []).length,
      _imageUrls: (note.images || []).slice(0, Math.max(imageLimit, 1)),
      text: note.text || ""
    })),
    detailSelection: result.detailSelection || [],
    browserInfo: result.browserInfo || null,
    authStatus: result.authStatus || null,
    warnings: result.warnings || [],
    ...(process.env.XHS_MCP_DEBUG === "1"
      ? { diagnostics: result.diagnostics || [], networkDiagnostics: result.networkDiagnostics || [] }
      : {})
  };
}

function clampImageLimit(value) {
  return Math.max(0, Math.min(Number(value) || 1, 3));
}

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: process.env.XHS_WEB_ORIGIN || "https://www.rednote.com"
    }
  });
  if (!response.ok) return null;
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0] || "image/jpeg";
  if (!mimeType.startsWith("image/")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) return null;
  if (mimeType.startsWith("image/") && process.platform === "darwin") {
    const converted = await convertImageForCodex(bytes, mimeType).catch(() => null);
    if (converted) return converted;
  }
  return { data: bytes.toString("base64"), mimeType };
}

async function cacheImage(image, title, index) {
  await mkdir(IMAGE_CACHE_DIR, { recursive: true });
  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  const safeTitle = String(title || "note").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "-").slice(0, 48) || "note";
  const filePath = path.join(IMAGE_CACHE_DIR, `${Date.now()}-${randomUUID()}-${safeTitle}-${index}.${extension}`);
  await writeFile(filePath, Buffer.from(image.data, "base64"));
  return filePath;
}

async function cleanupImageCache() {
  await mkdir(IMAGE_CACHE_DIR, { recursive: true });
  const cutoff = Date.now() - IMAGE_TTL_MS;
  const entries = await readdir(IMAGE_CACHE_DIR).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(IMAGE_CACHE_DIR, entry);
    const details = await stat(filePath).catch(() => null);
    if (details?.isFile() && details.mtimeMs < cutoff) {
      await unlink(filePath).catch(() => {});
    }
  }));
}

async function convertImageForCodex(bytes, mimeType) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "travel-research-mcp-image-"));
  const inputExtension = mimeType === "image/webp" ? "webp" : mimeType.split("/")[1] || "img";
  const inputPath = path.join(tempDir, `source.${inputExtension}`);
  const outputPath = path.join(tempDir, "converted.jpg");
  try {
    await writeFile(inputPath, bytes);
    await execFileAsync("/usr/bin/sips", [
      "-Z", "900",
      "-s", "format", "jpeg",
      "-s", "formatOptions", "70",
      inputPath,
      "--out", outputPath
    ], { timeout: 10000 });
    const jpeg = await readFile(outputPath);
    return { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function errorResult(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function sendProgress(progressToken, progress, total, message) {
  if (progressToken === undefined) return;
  writeNotification("notifications/progress", { progressToken, progress, total, message });
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeNotification(method, params) {
  writeMessage({ jsonrpc: "2.0", method, params });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
