const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function searchWebSources({ destination, preferences, queries: plannedQueries, maxResults = 10, onProgress }) {
  const warnings = [];
  const queries = plannedQueries?.length ? plannedQueries : buildWebQueries(destination, preferences);
  const found = new Map();

  for (const query of queries) {
    if (found.size >= maxResults) break;
    try {
      const results = await searchBaidu(query);
      if (!results.length) {
        results.push(...(await searchDuckDuckGo(query)));
      }
      if (!results.length) {
        results.push(...(await searchBrave(query)));
      }
      for (const result of results) {
        if (!result.url || found.has(result.url)) continue;
        found.set(result.url, {
          ...result,
          query,
          platform: inferPlatform(result.url),
          sourceType: inferSourceType(result.url, result.title)
        });
        if (found.size >= maxResults) break;
      }
    } catch (error) {
      warnings.push(`网页搜索失败：${query} (${error.message})`);
    }
  }

  const pages = [];
  const selected = Array.from(found.values()).slice(0, maxResults);
  for (const [index, item] of selected.entries()) {
    if (onProgress) await onProgress({
      type: "page",
      index: index + 1,
      total: selected.length,
      title: item.title || item.url
    });
    pages.push(await fetchPageSummary(item, warnings));
  }

  return { queries, pages, warnings };
}

function buildWebQueries(destination, preferences) {
  return [
    `${destination} 自由行 攻略 景点 美食 交通`,
    `site:mafengwo.cn ${destination} 攻略 行程`,
    `site:qyer.com ${destination} 攻略 行程`,
    `site:lonelyplanet.com ${destination} travel guide itinerary`,
    `${destination} 避雷 避坑 攻略`,
    `${destination} 必去景点 餐厅 住宿区域`,
    `${destination} 官方旅游 开放时间 门票`,
    `${destination} travel guide official tourism`,
    `${destination} itinerary attractions food transport ${preferences || ""}`
  ];
}

async function searchBaidu(query) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  const results = [];
  const itemRegex = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<span class="content-right_8Zs40">|<div class="c-abstract|<span class="c-color-text">)?([\s\S]{0,500})/g;
  let match;

  while ((match = itemRegex.exec(html)) && results.length < 8) {
    const url = decodeHtml(match[1]);
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3] || "").slice(0, 220);
    if (url && title) results.push({ title, url, snippet });
  }

  return results;
}

async function searchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  const results = [];
  const itemRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = itemRegex.exec(html)) && results.length < 8) {
    const url = cleanDuckDuckGoUrl(decodeHtml(match[1]));
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3]);
    if (url && title) results.push({ title, url, snippet });
  }

  return results;
}

async function searchBrave(query) {
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  const html = await fetchText(url);
  const results = [];
  const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = linkRegex.exec(html)) && results.length < 8) {
    const url = decodeHtml(match[1]);
    const title = stripHtml(match[2]);
    if (!title || shouldSkipSearchUrl(url)) continue;
    results.push({ title, url, snippet: "" });
  }

  return results;
}

function shouldSkipSearchUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host.includes("brave.com") || host.includes("duckduckgo.com");
  } catch {
    return true;
  }
}

async function fetchPageSummary(item, warnings) {
  try {
    const { text: html, finalUrl } = await fetchHtml(item.url, 12000);
    const title = extractTitle(html) || item.title;
    const text = stripHtml(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    )
      .replace(/\s+/g, " ")
      .slice(0, 2500);

    return {
      ...item,
      url: finalUrl || item.url,
      title,
      text: text || item.snippet,
      images: extractImages(html, finalUrl || item.url)
    };
  } catch (error) {
    warnings.push(`网页正文抓取失败：${item.title} (${error.message})`);
    return { ...item, text: item.snippet || "", images: [] };
  }
}

async function fetchText(url, timeoutMs = 15000) {
  const { text } = await fetchHtml(url, timeoutMs);
  return text;
}

async function fetchHtml(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return {
      text: await response.text(),
      finalUrl: response.url
    };
  } finally {
    clearTimeout(timer);
  }
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
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 140) : "";
}

function extractImages(html, pageUrl) {
  const images = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) && images.length < 5) {
    try {
      images.push(new URL(match[1], pageUrl).href);
    } catch {
      // Ignore malformed image URLs.
    }
  }
  return images;
}

function inferPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("mafengwo")) return "马蜂窝";
    if (host.includes("qyer")) return "穷游";
    if (host.includes("lonelyplanet")) return "Lonely Planet";
    if (host.includes("tripadvisor")) return "Tripadvisor";
    if (host.includes("klook")) return "Klook";
    if (host.includes("kkday")) return "KKday";
    if (host.includes("gov") || host.includes("tourism")) return "官方/旅游局";
    return host;
  } catch {
    return "网页";
  }
}

function inferSourceType(url, title) {
  const text = `${url} ${title}`.toLowerCase();
  if (text.includes("official") || text.includes("tourism") || text.includes("gov")) return "official";
  if (text.includes("tripadvisor") || text.includes("review")) return "review";
  if (text.includes("klook") || text.includes("kkday") || text.includes("ticket")) return "booking";
  return "web";
}
