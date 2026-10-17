import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTravelGuideJob } from "./travelGuideJob.js";
import { understandTravelPrompt } from "./intentParser.js";
import { runTravelAgentWorkflow } from "./agent/workflow.js";
import { scrapeXiaohongshu } from "./xiaohongshuScraper.js";
import { loadLocalEnv } from "./localEnv.js";
import { startImageCacheCleanup } from "./cacheCleanup.js";
import { cacheRemoteImages, sanitizePathSegment } from "./imageCache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const serverVersion = "agent-progress-2026-06-09";
const jobs = new Map();

loadLocalEnv(rootDir);
const imageCache = startImageCacheCleanup({ rootDir });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg"
};

const imageMimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

function serveCachedImage(requestUrl, res) {
  const parts = requestUrl.pathname.split("/").filter(Boolean);
  const namespace = sanitizePathSegment(decodeURIComponent(parts[2] || ""));
  const filename = sanitizePathSegment(decodeURIComponent(parts[3] || ""));
  const filePath = path.normalize(path.join(rootDir, "cache", "images", namespace, filename));
  const cacheRoot = path.join(rootDir, "cache", "images");

  if (!filePath.startsWith(cacheRoot) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Image not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": imageMimeTypes[ext] || "application/octet-stream",
    "cache-control": "private, max-age=86400"
  });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { ok: true, version: serverVersion });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/images/")) {
      serveCachedImage(requestUrl, res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/sample") {
      const sample = await readFile(path.join(rootDir, "travel-guide-agent-framework.md"), "utf8");
      sendJson(res, 200, { sample });
      return;
    }

    if (req.method === "POST" && pathname === "/api/generate") {
      const input = await readJsonBody(req);
      const result = await runTravelGuideJob(input);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/understand") {
      const input = await readJsonBody(req);
      const result = await understandTravelPrompt(input);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat") {
      const input = await readJsonBody(req);
      const job = startChatJob(input);
      sendJson(res, 202, {
        ok: true,
        type: "job",
        jobId: job.id,
        message: "任务已开始。"
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/pause") {
      const input = await readJsonBody(req);
      const job = jobs.get(input.jobId);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "任务不存在或已过期" });
        return;
      }
      if (job.status === "running") {
        job.paused = true;
        job.status = "paused";
        job.progress.push({
          stage: "paused",
          message: "任务已暂停，会在当前页面读取完成后停住。",
          at: new Date().toISOString()
        });
      }
      sendJson(res, 200, { ok: true, status: job.status });
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/resume") {
      const input = await readJsonBody(req);
      const job = jobs.get(input.jobId);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "任务不存在或已过期" });
        return;
      }
      if (job.status === "paused") {
        job.paused = false;
        job.status = "running";
        job.progress.push({
          stage: "resumed",
          message: "任务已继续。",
          at: new Date().toISOString()
        });
      }
      sendJson(res, 200, { ok: true, status: job.status });
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/cancel") {
      const input = await readJsonBody(req);
      const job = jobs.get(input.jobId);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "任务不存在或已过期" });
        return;
      }
      if (!["done", "failed", "canceled"].includes(job.status)) {
        job.canceled = true;
        job.paused = false;
        job.status = "canceled";
        job.error = "任务已终止";
        job.progress.push({
          stage: "canceled",
          message: "任务已终止，可以重新输入需求。",
          at: new Date().toISOString()
        });
      }
      sendJson(res, 200, { ok: true, status: job.status });
      return;
    }

    if (req.method === "POST" && pathname === "/api/debug/xiaohongshu") {
      const input = await readJsonBody(req);
      const keyword = String(input.keyword || "").trim();
      if (!keyword) {
        sendJson(res, 400, { ok: false, error: "请输入小红书搜索关键词" });
        return;
      }
      const result = await scrapeXiaohongshu({
        keywords: [keyword],
        maxNotes: Math.min(Number(input.maxNotes || 5), 5),
        headless: input.headless !== false
      });
      sendJson(res, 200, { ok: true, keyword, ...result });
      return;
    }

    if (req.method === "POST" && pathname === "/api/debug/xhs-visual") {
      const input = await readJsonBody(req);
      const keyword = String(input.keyword || "").trim();
      if (!keyword) {
        sendJson(res, 400, { ok: false, error: "请输入小红书搜索关键词" });
        return;
      }
      const result = await scrapeXiaohongshu({
        keywords: [keyword],
        maxNotes: 1,
        headless: input.headless !== false,
        fetchDetails: true
      });
      const note = result.notes[0] || null;
      const namespace = `trial-${Date.now()}`;
      const cachedImages = note
        ? await cacheRemoteImages({
            rootDir,
            namespace,
            imageUrls: note.images || [],
            limit: 3
          })
        : [];
      const markdown = buildVisualTrialMarkdown({ keyword, note, cachedImages });
      sendJson(res, 200, {
        ok: true,
        keyword,
        note,
        cachedImages,
        markdown,
        warnings: result.warnings,
        browserInfo: result.browserInfo,
        authStatus: result.authStatus
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/status") {
      const jobId = requestUrl.searchParams.get("jobId");
      const job = jobs.get(jobId);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "任务不存在或已过期" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        jobId,
        status: job.status,
        paused: job.paused,
        canceled: job.canceled,
        progress: job.progress,
        result: job.result,
        error: job.error
      });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

server.listen(port, host, () => {
  console.log(`Travel Guide Agent running at http://${host}:${port}`);
  console.log(`Image cache cleanup enabled: ${imageCache.cacheDir}, TTL ${Math.round(imageCache.ttlMs / 60 / 60 / 1000)}h`);
});

function startChatJob(input) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const job = {
    id,
    status: "running",
    paused: false,
    canceled: false,
    progress: [],
    result: null,
    error: null,
    createdAt: Date.now()
  };
  jobs.set(id, job);

  runTravelAgentWorkflow({
    ...input,
    onProgress: async (event) => {
      throwIfCanceled(job);
      await waitIfPaused(job);
      throwIfCanceled(job);
      job.progress.push(event);
    }
  })
    .then((result) => {
      if (job.canceled) return;
      job.status = "done";
      job.result = result;
    })
    .catch((error) => {
      if (job.canceled || error.name === "CanceledJobError") {
        job.canceled = true;
        job.paused = false;
        job.status = "canceled";
        job.error = "任务已终止";
        if (!job.progress.some((item) => item.stage === "canceled")) {
          job.progress.push({
            stage: "canceled",
            message: "任务已终止，可以重新输入需求。",
            at: new Date().toISOString()
          });
        }
        return;
      }
      job.status = "failed";
      job.error = error.message;
      job.progress.push({
        stage: "failed",
        message: error.message,
        at: new Date().toISOString()
      });
    });

  return job;
}

function buildVisualTrialMarkdown({ keyword, note, cachedImages }) {
  if (!note) {
    return `## ${keyword}\n\n没有采集到可用小红书笔记。`;
  }

  const imageMarkdown = cachedImages.length
    ? cachedImages.map((image, index) => `![${note.title || keyword} 图${index + 1}](${image.publicUrl})`).join(" ")
    : "没有成功缓存到可显示图片。";

  return [
    `## ${note.title || keyword}`,
    "",
    `来源：[小红书/Rednote 笔记](${note.url})`,
    "",
    `摘要：${String(note.text || note.title || "").replace(/\s+/g, " ").slice(0, 260) || "暂无正文摘要。"}`,
    "",
    imageMarkdown
  ].join("\n");
}

async function waitIfPaused(job) {
  while (job.paused) {
    throwIfCanceled(job);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function throwIfCanceled(job) {
  if (!job.canceled) return;
  const error = new Error("任务已终止");
  error.name = "CanceledJobError";
  throw error;
}
