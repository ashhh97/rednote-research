const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  referer: "https://www.xiaohongshu.com/"
};

export async function readXhsNotePublic(url, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      redirect: "follow"
    });
    const html = await response.text();
    const parsed = parseXhsHtml(html, url);
    return {
      ...parsed,
      url: response.url || url,
      status: response.status,
      ok: response.ok,
      htmlLength: html.length
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      title: "",
      author: "",
      text: "",
      tags: [],
      images: [],
      warnings: [`免登录读取失败：${error.message}`]
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseXhsHtml(html, url = "") {
  const warnings = [];
  const stateCandidates = extractStateCandidates(html);
  const objectCandidates = stateCandidates.flatMap((state) => collectObjects(state));
  const note = chooseBestNote(objectCandidates);
  const meta = extractMeta(html);

  const title = note.title || meta.title || "";
  const desc = note.desc || note.content || meta.description || "";
  const tags = Array.from(new Set([...(note.tags || []), ...meta.tags])).filter(Boolean);
  const images = Array.from(new Set([...(note.images || []), ...meta.images])).filter(isUsefulImage).slice(0, 12);
  const author = note.author || meta.author || "";
  const text = [
    title,
    desc,
    author ? `作者：${author}` : "",
    tags.length ? `标签：${tags.join("、")}` : ""
  ].filter(Boolean).join("\n");

  if (!stateCandidates.length) warnings.push("HTML 中没有找到可解析的初始化数据。");
  if (!desc || desc.length < 40) warnings.push("没有稳定解析到笔记正文，可能只拿到了页面 meta 摘要。");

  return {
    url,
    title,
    author,
    text,
    desc,
    tags,
    images,
    source: note.source || meta.source || "html",
    warnings
  };
}

function extractStateCandidates(html) {
  const candidates = [];
  for (const script of extractScripts(html)) {
    const text = decodeHtmlEntities(script).trim();
    if (!text) continue;
    if (text.includes("__NEXT_DATA__") || text.startsWith("{")) {
      const parsed = parseLooseJson(text);
      if (parsed) candidates.push(parsed);
    }

    for (const marker of ["window.__INITIAL_STATE__=", "window.__INITIAL_STATE__ =", "__INITIAL_STATE__="]) {
      const index = text.indexOf(marker);
      if (index < 0) continue;
      const payload = text.slice(index + marker.length).replace(/;?\s*$/, "");
      const parsed = parseLooseJson(payload);
      if (parsed) candidates.push(parsed);
    }
  }
  return candidates;
}

function extractScripts(html) {
  const scripts = [];
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html))) scripts.push(match[1]);

  const nextDataMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) scripts.push(nextDataMatch[1]);
  return scripts;
}

function parseLooseJson(text) {
  const trimmed = text.trim();
  const jsonText = trimmed
    .replace(/^window\.[\w.]+\s*=\s*/, "")
    .replace(/;$/, "")
    .replace(/\bundefined\b/g, "null");
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function collectObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (!Array.isArray(value)) output.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectObjects(child, output);
  }
  return output;
}

function chooseBestNote(objects) {
  const scored = objects.map((object) => {
    const title = firstString(object, ["title", "display_title", "displayTitle", "name"]);
    const desc = firstString(object, ["desc", "description", "content", "text", "noteText"]);
    const author = normalizeAuthor(object);
    const tags = normalizeTags(object);
    const images = normalizeImages(object);
    const score = (title ? 20 : 0) + Math.min(desc.length, 500) + images.length * 8 + tags.length * 5;
    return { title, desc, content: desc, author, tags, images, source: "initial_state", score };
  });

  return scored
    .filter((item) => item.title || item.desc || item.images.length)
    .sort((a, b) => b.score - a.score)[0] || { title: "", desc: "", content: "", author: "", tags: [], images: [] };
}

function extractMeta(html) {
  const meta = {};
  const metaRegex = /<meta\b([^>]+)>/gi;
  let match;
  while ((match = metaRegex.exec(html))) {
    const attrs = match[1];
    const name = getAttr(attrs, "name") || getAttr(attrs, "property");
    const content = getAttr(attrs, "content");
    if (name && content) meta[name] = decodeHtmlEntities(content);
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanTitle(meta["og:title"] || meta.title || (titleMatch ? decodeHtmlEntities(titleMatch[1]) : ""));
  const description = meta["og:description"] || meta.description || "";
  const keywords = (meta.keywords || "").split(/[,，#\s]+/).map((tag) => tag.trim()).filter(Boolean);
  return {
    title,
    description,
    author: meta.author || "",
    tags: keywords,
    images: [meta["og:image"]].filter(Boolean),
    source: "meta"
  };
}

function getAttr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}=[\"']([^\"']*)[\"']`, "i"));
  return match ? match[1] : "";
}

function firstString(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeAuthor(object) {
  const direct = firstString(object, ["author", "nickname", "nickName", "userName"]);
  if (direct) return direct;
  const user = object.user || object.userInfo || object.user_info;
  return firstString(user || {}, ["nickname", "nickName", "name", "userName"]);
}

function normalizeTags(object) {
  const value = object.tag_list || object.tagList || object.tags || object.hashTags;
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => typeof tag === "string" ? tag : firstString(tag, ["name", "tagName", "title"]))
    .filter(Boolean);
}

function normalizeImages(object) {
  const values = [];
  for (const key of ["image_list", "imageList", "images", "imgs", "cover", "image"]) {
    const value = object?.[key];
    if (typeof value === "string") values.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") values.push(item);
        if (item && typeof item === "object") {
          values.push(item.url, item.src, item.url_pre, item.url_default, item.original, item.thumbnail);
          if (Array.isArray(item.info_list)) values.push(...item.info_list.map((info) => info.url));
        }
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      values.push(value.url, value.src, value.url_pre, value.url_default, value.original, value.thumbnail);
    }
  }
  return Array.from(new Set(values.filter(isUsefulImage))).slice(0, 12);
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'");
}

function cleanTitle(title) {
  return title.replace(/ - 小红书$/, "").trim();
}

function isUsefulImage(src) {
  return Boolean(typeof src === "string" && /^https?:\/\//.test(src) && !src.includes("avatar"));
}
