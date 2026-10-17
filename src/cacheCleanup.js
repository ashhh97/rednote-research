import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TTL_HOURS = 24;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export function startImageCacheCleanup({
  rootDir,
  ttlHours = Number(process.env.IMAGE_CACHE_TTL_HOURS || DEFAULT_TTL_HOURS),
  intervalMs = Number(process.env.IMAGE_CACHE_CLEANUP_INTERVAL_MS || DEFAULT_INTERVAL_MS)
}) {
  const cacheDir = path.join(rootDir, "cache", "images");
  const ttlMs = Math.max(ttlHours, 1) * 60 * 60 * 1000;

  cleanupImageCache({ cacheDir, ttlMs }).catch((error) => {
    console.warn(`Image cache cleanup failed: ${error.message}`);
  });

  const timer = setInterval(() => {
    cleanupImageCache({ cacheDir, ttlMs }).catch((error) => {
      console.warn(`Image cache cleanup failed: ${error.message}`);
    });
  }, Math.max(intervalMs, 60 * 1000));

  timer.unref?.();
  return { cacheDir, ttlMs, intervalMs };
}

export async function cleanupImageCache({ cacheDir, ttlMs = DEFAULT_TTL_HOURS * 60 * 60 * 1000, now = Date.now() }) {
  await mkdir(cacheDir, { recursive: true });
  return cleanupDirectory(cacheDir, { ttlMs, now, isRoot: true });
}

async function cleanupDirectory(dir, { ttlMs, now, isRoot = false }) {
  let removedFiles = 0;
  let removedDirs = 0;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = await cleanupDirectory(entryPath, { ttlMs, now });
      removedFiles += result.removedFiles;
      removedDirs += result.removedDirs;
      continue;
    }

    if (!entry.isFile()) continue;
    const info = await stat(entryPath);
    if (now - info.mtimeMs > ttlMs) {
      await rm(entryPath, { force: true });
      removedFiles += 1;
    }
  }

  if (!isRoot) {
    const remaining = await readdir(dir);
    const info = await stat(dir);
    if (!remaining.length && now - info.mtimeMs > ttlMs) {
      await rm(dir, { recursive: true, force: true });
      removedDirs += 1;
    }
  }

  return { removedFiles, removedDirs };
}
