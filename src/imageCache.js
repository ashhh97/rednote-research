import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const IMAGE_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  referer: "https://www.rednote.com/"
};

export async function cacheRemoteImages({
  rootDir,
  imageUrls,
  namespace = "trial",
  limit = 3
}) {
  const cacheDir = path.join(rootDir, "cache", "images", sanitizePathSegment(namespace));
  await mkdir(cacheDir, { recursive: true });

  const cached = [];
  for (const sourceUrl of Array.from(new Set(imageUrls || [])).filter(isHttpUrl)) {
    if (cached.length >= limit) break;
    try {
      const item = await cacheOneImage({ cacheDir, namespace, sourceUrl });
      cached.push(item);
    } catch {
      // Skip images that block direct fetching; the caller can still use other images.
    }
  }
  return cached;
}

async function cacheOneImage({ cacheDir, namespace, sourceUrl }) {
  const response = await fetch(sourceUrl, {
    headers: IMAGE_HEADERS,
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`not an image: ${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash("sha256").update(sourceUrl).digest("hex").slice(0, 20);
  const ext = extensionFromContentType(contentType) || extensionFromUrl(sourceUrl) || ".jpg";
  const filename = `${hash}${ext}`;
  const filePath = path.join(cacheDir, filename);
  await writeFile(filePath, bytes);

  return {
    sourceUrl,
    filePath,
    publicUrl: `/api/images/${encodeURIComponent(sanitizePathSegment(namespace))}/${encodeURIComponent(filename)}`,
    contentType,
    size: bytes.length
  };
}

function extensionFromContentType(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  return "";
}

function extensionFromUrl(rawUrl) {
  try {
    const ext = path.extname(new URL(rawUrl).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : "";
  } catch {
    return "";
  }
}

export function sanitizePathSegment(value) {
  return String(value || "trial").replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 80) || "trial";
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}
