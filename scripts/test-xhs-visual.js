#!/usr/bin/env node
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { scrapeXiaohongshu } from "../src/xiaohongshuScraper.js";
import { cacheRemoteImages } from "../src/imageCache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const keyword = process.argv[2] || "致爱书房";
const headless = process.argv.includes("--show") ? false : true;
const debug = process.argv.includes("--debug");

const result = await scrapeXiaohongshu({
  keywords: [keyword],
  maxNotes: 1,
  headless,
  debug,
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

const outputDir = path.join(rootDir, "xhs-debug");
await mkdir(outputDir, { recursive: true });
const safeKeyword = keyword.replace(/[^\p{Letter}\p{Number}]+/gu, "-").slice(0, 40) || "xhs";
const htmlPath = path.join(outputDir, `${Date.now()}-${safeKeyword}-visual.html`);
await writeFile(htmlPath, buildHtml({ keyword, note, cachedImages, warnings: result.warnings }), "utf8");

console.log(JSON.stringify({
  ok: Boolean(note),
  keyword,
  htmlPath,
  openUrl: pathToFileURL(htmlPath).href,
  title: note?.title || "",
  noteUrl: note?.url || "",
  originalImageCount: note?.images?.length || 0,
  cachedImageCount: cachedImages.length,
  warnings: result.warnings
}, null, 2));

function buildHtml({ keyword, note, cachedImages, warnings }) {
  const title = escapeHtml(note?.title || keyword);
  const summary = escapeHtml(String(note?.text || note?.title || "没有采集到正文。").replace(/\s+/g, " ").slice(0, 600));
  const noteUrl = note?.url ? `<a href="${escapeHtml(note.url)}" target="_blank" rel="noreferrer">打开原笔记</a>` : "";
  const images = cachedImages.length
    ? cachedImages.map((image, index) => `<img src="${pathToFileURL(image.filePath).href}" alt="${title} 图${index + 1}">`).join("")
    : `<p class="muted">没有成功缓存到可显示图片，可能是图片源限制了下载。</p>`;
  const warningList = warnings?.length
    ? `<h2>提醒</h2><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #202427; line-height: 1.65; }
    main { max-width: 980px; margin: 0 auto; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin-top: 28px; }
    a { color: #156b5d; }
    .muted { color: #697279; }
    .image-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
    img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border: 1px solid #deded8; border-radius: 8px; background: #f0f3ee; }
    @media (max-width: 760px) { body { margin: 18px; } .image-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="muted">关键词：${escapeHtml(keyword)} ${noteUrl ? ` · ${noteUrl}` : ""}</p>
    <h2>笔记摘要</h2>
    <p>${summary}</p>
    <h2>图片预览</h2>
    <div class="image-grid">${images}</div>
    ${warningList}
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
