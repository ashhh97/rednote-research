import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function searchXhsLinksViaWeb(keyword, { maxLinks = 8 } = {}) {
  const warnings = [];
  const queries = [
    `site:xiaohongshu.com/explore ${keyword}`,
    `site:xiaohongshu.com ${keyword} 小红书`,
    `${keyword} 小红书 攻略`
  ];
  const found = new Map();

  for (const query of queries) {
    if (found.size >= maxLinks) break;
    try {
      const results = [
        ...(await searchBaidu(query)),
        ...(await searchDuckDuckGo(query)),
        ...(await searchBing(query))
      ];
      for (const result of results) {
        const noteUrl = findXhsUrl(`${result.url} ${result.title} ${result.snippet}`);
        if (!noteUrl || found.has(noteUrl)) continue;
        found.set(noteUrl, {
          title: result.title,
          url: noteUrl,
          snippet: result.snippet,
          query
        });
        if (found.size >= maxLinks) break;
      }
    } catch (error) {
      warnings.push(`小红书链接搜索失败：${query} (${error.message})`);
    }
  }

  return {
    queries,
    links: Array.from(found.values()).slice(0, maxLinks),
    warnings
  };
}

async function searchBaidu(query) {
  const html = await fetchText(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}`);
  const results = [];
  const regex = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?([\s\S]{0,500})/g;
  let match;
  while ((match = regex.exec(html)) && results.length < 10) {
    const url = decodeHtml(match[1]);
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3] || "").slice(0, 240);
    if (title) results.push({ title, url, snippet });
  }
  return results;
}

async function searchDuckDuckGo(query) {
  const html = await fetchText(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  const results = [];
  const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let match;
  while ((match = regex.exec(html)) && results.length < 10) {
    const url = cleanDuckDuckGoUrl(decodeHtml(match[1]));
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3] || "").slice(0, 240);
    if (title) results.push({ title, url, snippet });
  }
  return results;
}

async function searchBing(query) {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
  const results = [];
  const regex = /<li class="b_algo"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/g;
  let match;
  while ((match = regex.exec(html)) && results.length < 10) {
    const url = decodeHtml(match[1]);
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3] || "").slice(0, 240);
    if (title) results.push({ title, url, snippet });
  }
  return results;
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
        },
        redirect: "follow"
      });
      return await response.text();
    } catch (error) {
      return await fetchTextWithCurl(url, timeoutMs, error);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithCurl(url, timeoutMs, fetchError) {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-L",
        "--compressed",
        "--max-time",
        String(Math.ceil(timeoutMs / 1000)),
        "-A",
        USER_AGENT,
        "-H",
        "accept-language: zh-CN,zh;q=0.9,en;q=0.8",
        url
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    return stdout;
  } catch (curlError) {
    throw new Error(`${fetchError.message}; curl fallback failed: ${curlError.message}`);
  }
}

function findXhsUrl(rawText) {
  const decoded = decodeURIComponent(rawText || "");
  const match = decoded.match(/https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|search_result)\/([0-9a-fA-F]+)/);
  if (!match) return "";
  return `https://www.xiaohongshu.com/explore/${match[1]}`;
}

function cleanDuckDuckGoUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    if (url.pathname === "/l/") return url.searchParams.get("uddg") || rawUrl;
    return url.href;
  } catch {
    return rawUrl;
  }
}

function stripHtml(html) {
  return decodeHtml(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}
