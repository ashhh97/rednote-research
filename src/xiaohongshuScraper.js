import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { selectDetailNotes } from "./noteSelection.js";

function getXhsWebOrigin() {
  return process.env.XHS_WEB_ORIGIN || "https://www.rednote.com";
}

function getNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * Math.max(max - min, 0));
}

function absoluteXhsUrl(href) {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `${getXhsWebOrigin()}${href.startsWith("/") ? "" : "/"}${href}`;
}

function normalizeXhsNoteUrl(href) {
  const absoluteUrl = absoluteXhsUrl(href);
  const match = absoluteUrl.match(/(?:xiaohongshu|rednote)\.com\/(?:explore|search_result)\/([0-9a-fA-F]+)/);
  if (!match) return "";
  return `${getXhsWebOrigin()}/explore/${match[1]}`;
}

function getXhsNoteId(note) {
  return note?.url?.match(/\/explore\/([0-9a-fA-F]+)/)?.[1] || "";
}

function getXhsSearchResultUrl(note) {
  const noteId = getXhsNoteId(note);
  if (!noteId) return note.url || "";
  const params = new URLSearchParams();
  if (note.xsecToken) params.set("xsec_token", note.xsecToken);
  params.set("xsec_source", note.xsecSource || "pc_search");
  return `${getXhsWebOrigin()}/search_result/${noteId}?${params.toString()}`;
}

export async function scrapeXiaohongshu({
  keywords,
  maxNotes,
  headless,
  debug = false,
  loginWaitMs = 0,
  fetchDetails = false,
  useAuth = true,
  onProgress
}) {
  const warnings = [];
  const diagnostics = [];
  const browserInfo = {
    engine: "playwright-chromium",
    executablePath: "bundled",
    fallbackUsed: false,
    headless,
    launchMode: "launch"
  };
  const networkDiagnostics = [];
  const authStatus = {
    checked: false,
    loggedIn: false,
    guest: null,
    userId: "",
    nickname: ""
  };
  let chromium;

  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return {
      notes: [],
      browserInfo,
      warnings: ["没有安装 Playwright。请先运行 npm install，然后再试自动浏览。"]
    };
  }

  let browser;
  try {
    browser = await launchChromium(chromium, headless, warnings, browserInfo);
  } catch (error) {
    return {
      notes: [],
      browserInfo,
      warnings: [
        ...warnings,
        `小红书浏览器启动失败：${error.message}`,
        `小红书浏览器：${browserInfo.engine} (${browserInfo.executablePath})，headless=${browserInfo.headless}`
      ]
    };
  }
  const authDir = path.resolve(process.env.XHS_AUTH_DIR || "xhs-auth");
  const storageStatePath = path.join(authDir, "storage-state.json");
  await mkdir(authDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale: "zh-CN",
    ...(useAuth && existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  const apiCards = new Map();
  attachNetworkDiagnostics(page, networkDiagnostics, apiCards, authStatus);

  const found = new Map();

  try {
    for (const [queryIndex, keyword] of keywords.entries()) {
      if (found.size >= maxNotes) break;
      apiCards.clear();
      const remainingQueries = keywords.length - queryIndex;
      const queryLimit = Math.ceil((maxNotes - found.size) / remainingQueries);
      let addedForQuery = 0;
      const url = `${getXhsWebOrigin()}/search_result?keyword=${encodeURIComponent(keyword)}`;
      try {
        await page.goto(url, { waitUntil: "commit", timeout: 20000 });
      } catch (error) {
        warnings.push(`小红书关键词打开未完全完成，继续尝试读取页面：${keyword} (${error.message})`);
        if (debug) diagnostics.push(await collectDiagnostics(page, keyword).catch((diagError) => ({ keyword, error: diagError.message })));
      }
      await page.waitForTimeout(6000);

      if (await page.locator("text=登录").first().isVisible().catch(() => false)) {
        warnings.push("小红书可能要求登录。已尽量采集公开搜索结果；如果结果少，请用非无头模式登录后重试。");
        if (loginWaitMs > 0) {
          await promptLogin({ page, context, storageStatePath, loginWaitMs, warnings });
        }
      }

      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(900);
      }

      let cards = [];
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
        cards = await waitForSearchCards(page, getNumberEnv("XHS_SEARCH_TIMEOUT_MS", 45000));
        cards = mergeCards(Array.from(apiCards.values()), cards);
        if (!cards.length && debug) {
          const diagnostic = await collectDiagnostics(page, keyword);
          diagnostics.push(diagnostic);
          if (diagnostic.bodyText?.includes("登录")) {
            warnings.push("小红书搜索页已打开但没有返回笔记，页面包含“登录”，需要先建立登录态。");
            if (loginWaitMs > 0) {
              await promptLogin({ page, context, storageStatePath, loginWaitMs, warnings });
              cards = await collectSearchCards(page).catch(() => []);
            }
          }
        }
      } catch (error) {
        warnings.push(`小红书搜索结果读取失败：${keyword} (${error.message})`);
        if (debug) diagnostics.push(await collectDiagnostics(page, keyword).catch((diagError) => ({ keyword, error: diagError.message })));
        continue;
      }

      for (const card of cards) {
        const noteUrl = normalizeXhsNoteUrl(card.url);
        if (!noteUrl || found.has(noteUrl)) continue;
        found.set(noteUrl, {
          title: card.title || keyword,
          url: noteUrl,
          keyword,
          xsecToken: card.xsecToken || "",
          xsecSource: card.xsecSource || "pc_search",
          author: card.author || "",
          stats: card.stats || {},
          tags: card.tags || [],
          ipLocation: card.ipLocation || "",
          images: Array.from(new Set([...(card.images || []), card.image].filter(isUsefulImage))).slice(0, 8),
          text: card.text
        });
        addedForQuery += 1;
        if (found.size >= maxNotes || addedForQuery >= queryLimit) break;
      }
    }

    const notes = Array.from(found.values());
    const detailLimit = Math.max(5, Math.min(getNumberEnv("XHS_DETAIL_LIMIT", 10), 10));
    const detailSelection = selectDetailNotes(notes, detailLimit);
    const detailNotes = detailSelection.notes;
    if (onProgress) {
      for (const [index, selection] of detailSelection.selections.entries()) {
        await onProgress({
          type: "selection",
          index: index + 1,
          total: detailSelection.selections.length,
          title: selection.title,
          score: selection.score,
          reasons: selection.reasons
        });
      }
    }
    if (fetchDetails) for (const [index, note] of detailNotes.entries()) {
      try {
        if (onProgress) await onProgress({
          type: "detail",
          index: index + 1,
          total: detailNotes.length,
          title: note.title || note.url
        });
        const detail = await fetchNoteDetailByNavigation(context, note, networkDiagnostics);
        for (const key of ["likedCount", "collectedCount", "commentCount"]) {
          if (detail?.stats?.[key] !== "" && detail?.stats?.[key] != null) {
            note.stats[key] = detail.stats[key];
          }
        }
        if (detail?.text || detail?.images?.length) {
          if (isUsefulDetailText(detail.text, note.title)) note.text = detail.text;
          note.images = Array.from(new Set([...(note.images || []), ...(detail.images || [])].filter(isUsefulImage))).slice(0, 8);
          continue;
        }
        warnings.push(`笔记详情没有读到正文，已保留搜索卡片信息：${note.title || note.url}`);
      } catch (error) {
        warnings.push(`笔记详情采集失败，已保留搜索卡片信息：${note.title || note.url} (${error.message})`);
      }
      await respectfulDelay();
    }

    return {
      notes,
      detailSelection: detailSelection.selections,
      browserInfo,
      authStatus,
      diagnostics,
      networkDiagnostics,
      warnings: [
        ...(authStatus.checked && !authStatus.loggedIn ? ["小红书仍是游客状态，登录未成功；详情正文通常拿不到。"] : []),
        ...warnings,
        `小红书浏览器：${browserInfo.engine} (${browserInfo.executablePath})，headless=${browserInfo.headless}`
      ]
    };
  } catch (error) {
    warnings.push(`小红书自动浏览失败：${error.message}`);
    return {
      notes: Array.from(found.values()),
      detailSelection: [],
      browserInfo,
      authStatus,
      diagnostics,
      networkDiagnostics,
      warnings: [
        ...(authStatus.checked && !authStatus.loggedIn ? ["小红书仍是游客状态，登录未成功；详情正文通常拿不到。"] : []),
        ...warnings,
        `小红书浏览器：${browserInfo.engine} (${browserInfo.executablePath})，headless=${browserInfo.headless}`
      ]
    };
  } finally {
    await context.storageState({ path: storageStatePath }).catch(() => {});
    await browser.close();
  }
}

async function waitForSearchCards(page, timeoutMs) {
  const start = Date.now();
  let cards = [];
  while (Date.now() - start < timeoutMs) {
    cards = await collectSearchCards(page).catch(() => []);
    if (cards.length) return cards;
    await page.mouse.wheel(0, 600).catch(() => {});
    await page.waitForTimeout(2500);
  }
  return cards;
}

function attachNetworkDiagnostics(page, networkDiagnostics, apiCards, authStatus) {
  page.on("response", async (response) => {
    const url = response.url();
    if (
      !url.includes("xiaohongshu.com/api") &&
      !url.includes("edith.xiaohongshu.com/api") &&
      !url.includes("rednote.com/api") &&
      !url.includes("webapi.rednote.com/api")
    ) return;
    if (!/search|note|feed|web\/v\d/.test(url)) return;
    const entry = {
      type: "response",
      status: response.status(),
      url: url.slice(0, 240)
    };
    try {
      const text = await response.text();
      entry.body = text.slice(0, 500);
      if (url.includes("/api/sns/web/v2/user/me")) {
        updateAuthStatus(authStatus, text);
      }
      if (url.includes("/api/sns/web/v1/search/notes")) {
        for (const card of extractCardsFromSearchApi(text)) {
          const noteUrl = normalizeXhsNoteUrl(card.url);
          if (noteUrl && !apiCards.has(noteUrl)) apiCards.set(noteUrl, card);
        }
      }
    } catch {
      // Some responses cannot be read twice or are blocked by the browser.
    }
    networkDiagnostics.push(entry);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("xiaohongshu.com") && !url.includes("rednote.com") && !url.includes("xhscdn.com")) return;
    networkDiagnostics.push({
      type: "requestfailed",
      url: url.slice(0, 240),
      failure: request.failure()?.errorText || ""
    });
  });
}

function updateAuthStatus(authStatus, text) {
  try {
    const data = JSON.parse(text)?.data;
    if (!data) return;
    if (authStatus.loggedIn && data.guest !== false) return;
    const hasGuest = Object.prototype.hasOwnProperty.call(data, "guest");
    const hasIdentity = Boolean(data.user_id || data.nickname || data.red_id);
    authStatus.checked = true;
    authStatus.guest = hasGuest ? data.guest : null;
    authStatus.loggedIn = data.guest === false && hasIdentity;
    authStatus.userId = data.user_id || "";
    authStatus.nickname = data.nickname || "";
  } catch {
    // Ignore malformed diagnostics payloads.
  }
}

function extractCardsFromSearchApi(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }

  const items = data?.data?.items;
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item?.model_type === "note" && item?.id && item?.note_card)
    .map((item) => {
      const card = item.note_card;
      const title = card.display_title || card.title || "";
      const desc = card.desc || "";
      const userName = card.user?.nickname || card.user?.nick_name || "";
      const likedCount = card.interact_info?.liked_count ?? "";
      const collectedCount = card.interact_info?.collected_count ?? "";
      const commentCount = card.interact_info?.comment_count ?? "";
      const tags = Array.isArray(card.tag_list) ? card.tag_list.map((tag) => tag.name).filter(Boolean) : [];
      const ipLocation = card.ip_location || "";
      const cover = card.cover?.url_pre || card.cover?.url_default || "";
      const imageList = Array.isArray(card.image_list)
        ? card.image_list
            .flatMap((image) => [
              image.url_pre,
              image.url_default,
              ...(Array.isArray(image.info_list) ? image.info_list.map((info) => info.url) : [])
            ])
            .filter(isUsefulImage)
        : [];

      return {
        title,
        url: `${getXhsWebOrigin()}/explore/${item.id}`,
        xsecToken: item.xsec_token || "",
        xsecSource: "pc_search",
        image: cover,
        images: Array.from(new Set([cover, ...imageList].filter(isUsefulImage))).slice(0, 8),
        author: userName,
        stats: {
          likedCount,
          collectedCount,
          commentCount
        },
        tags,
        ipLocation,
        text: [
          title,
          desc,
          userName ? `作者：${userName}` : "",
          likedCount ? `${likedCount}赞` : "",
          collectedCount ? `${collectedCount}收藏` : "",
          commentCount ? `${commentCount}评论` : "",
          tags.length ? `标签：${tags.join("、")}` : "",
          ipLocation ? `IP属地：${ipLocation}` : ""
        ].filter(Boolean).join("\n")
      };
    });
}

async function fetchNoteDetailByNavigation(context, note, networkDiagnostics) {
  const detailPage = await context.newPage();
  const feedDetails = [];

  detailPage.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/sns/web/v1/feed")) return;
    const entry = {
      type: "detail-response",
      status: response.status(),
      url: url.slice(0, 240),
      note: note.title || note.url
    };
    try {
      const text = await response.text();
      entry.body = text.slice(0, 500);
      const parsed = parseNoteDetailFromFeedApi(text);
      if (parsed) feedDetails.push(parsed);
    } catch (error) {
      entry.error = error.message;
    }
    networkDiagnostics.push(entry);
  });

  try {
    await detailPage.goto(getXhsSearchResultUrl(note), { waitUntil: "commit", timeout: 25000 });
    await detailPage.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await detailPage.waitForTimeout(randomBetween(
      getNumberEnv("XHS_DETAIL_READ_MIN_MS", 12000),
      getNumberEnv("XHS_DETAIL_READ_MAX_MS", 22000)
    ));

    const apiDetail = feedDetails.find((detail) => isUsefulDetailText(detail.text, note.title));
    if (apiDetail) return apiDetail;

    const domDetail = await detailPage.evaluate(() => {
      const selectors = [
        ".note-content",
        ".note-detail-mask",
        ".note-container",
        "[class*='note-content']",
        "[class*='desc']",
        "main"
      ];
      const textParts = [];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = element?.innerText?.trim().replace(/\n{3,}/g, "\n\n");
        if (text) textParts.push(text);
      }
      const bodyText = document.body.innerText.trim().replace(/\n{3,}/g, "\n\n");
      const images = Array.from(document.querySelectorAll("img"))
        .map((img) => img.src)
        .filter(Boolean)
        .slice(0, 16);
      return {
        text: (textParts.find((text) => text.length > 60) || bodyText).slice(0, 5000),
        images
      };
    });

    return {
      text: isUsefulDetailText(domDetail.text, note.title) ? domDetail.text : "",
      images: domDetail.images
    };
  } finally {
    await detailPage.close().catch(() => {});
  }
}

async function respectfulDelay() {
  const min = getNumberEnv("XHS_BETWEEN_NOTE_MIN_MS", 5000);
  const max = getNumberEnv("XHS_BETWEEN_NOTE_MAX_MS", 12000);
  await new Promise((resolve) => setTimeout(resolve, randomBetween(min, max)));
}

function parseNoteDetailFromFeedApi(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  const card = data?.data?.items?.[0]?.note_card;
  if (!card) return null;

  const title = card.title || card.display_title || "";
  const desc = card.desc || "";
  const userName = card.user?.nickname || card.user?.nick_name || "";
  const tags = Array.isArray(card.tag_list) ? card.tag_list.map((tag) => tag.name).filter(Boolean) : [];
  const images = Array.isArray(card.image_list)
    ? card.image_list
        .flatMap((image) => [
          image.url_pre,
          image.url_default,
          ...(Array.isArray(image.info_list) ? image.info_list.map((info) => info.url) : [])
        ])
        .filter(isUsefulImage)
    : [];

  return {
    text: [
      title,
      desc,
      userName ? `作者：${userName}` : "",
      tags.length ? `标签：${tags.join("、")}` : ""
    ].filter(Boolean).join("\n"),
    images,
    stats: {
      likedCount: card.interact_info?.liked_count ?? "",
      collectedCount: card.interact_info?.collected_count ?? "",
      commentCount: card.interact_info?.comment_count ?? ""
    }
  };
}

function isUsefulDetailText(text, title = "") {
  if (!text || text.trim().length < 40) return false;
  const normalized = text.replace(/\s+/g, "");
  const chromeWords = ["沪ICP备", "营业执照", "增值电信业务经营许可证", "首页点点aiRED直播发布消息"];
  if (chromeWords.some((word) => normalized.includes(word)) && normalized.length < 900) return false;
  if (normalized.includes("当前页面不见了") || normalized.includes("页面不见了")) return false;
  if (title && normalized.length < 120 && !normalized.includes(title.replace(/\s+/g, "").slice(0, 12))) return false;
  return true;
}

function mergeCards(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const card of group || []) {
      const noteUrl = normalizeXhsNoteUrl(card.url);
      if (!noteUrl) continue;
      const existing = merged.get(noteUrl) || {};
      merged.set(noteUrl, {
        ...existing,
        ...card,
        url: noteUrl,
        images: Array.from(new Set([...(existing.images || []), ...(card.images || []), card.image].filter(isUsefulImage))).slice(0, 8)
      });
    }
  }
  return Array.from(merged.values());
}

async function promptLogin({ page, context, storageStatePath, loginWaitMs, warnings }) {
  warnings.push(`尝试点击小红书登录按钮，并等待你登录，最多 ${Math.round(loginWaitMs / 1000)} 秒。`);
  await clickLoginButton(page, warnings);
  const deadline = Date.now() + loginWaitMs;
  while (Date.now() < deadline) {
    const status = await getPageAuthStatus(page).catch(() => null);
    if (status?.loggedIn) {
      warnings.push(`小红书登录成功：${status.nickname || status.userId || "已登录账号"}`);
      await context.storageState({ path: storageStatePath }).catch(() => {});
      await page.reload({ waitUntil: "commit", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(5000);
      return;
    }
    await page.waitForTimeout(3000);
  }
  warnings.push("等待登录超时，当前仍未检测到有效登录态。");
  await context.storageState({ path: storageStatePath }).catch(() => {});
  await page.reload({ waitUntil: "commit", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(8000);
}

async function getPageAuthStatus(page) {
  return page.evaluate(async () => {
    const response = await fetch("https://edith.xiaohongshu.com/api/sns/web/v2/user/me", {
      credentials: "include"
    });
    const json = await response.json();
    const data = json?.data || {};
    return {
      checked: true,
      loggedIn: data.guest === false,
      guest: Boolean(data.guest),
      userId: data.user_id || "",
      nickname: data.nickname || ""
    };
  });
}

async function clickLoginButton(page, warnings) {
  const selectors = [
    "button:has-text('登录')",
    "text=登录",
    ".login-btn",
    "[class*='login']"
  ];
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) {
        await locator.click({ timeout: 3000 });
        warnings.push(`已点击登录入口：${selector}`);
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      // Try the next selector.
    }
  }
  warnings.push("未自动找到登录按钮，请在打开的浏览器里手动点击左侧红色“登录”。");
  return false;
}

async function collectDiagnostics(page, keyword) {
  const debugDir = path.resolve("xhs-debug");
  await mkdir(debugDir, { recursive: true });
  const safeKeyword = keyword.replace(/[^\p{Letter}\p{Number}]+/gu, "-").slice(0, 40);
  const screenshotPath = path.join(debugDir, `${Date.now()}-${safeKeyword}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const snapshot = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a"))
      .slice(0, 30)
      .map((anchor) => ({
        text: anchor.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || "",
        href: anchor.getAttribute("href") || ""
      }));
    return {
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText.trim().replace(/\s+/g, " ").slice(0, 1000),
      anchors
    };
  });

  return {
    keyword,
    screenshotPath,
    ...snapshot
  };
}

async function collectSearchCards(page) {
  return page.evaluate(() => {
    const anchors = Array.from(
      document.querySelectorAll(
        "a[href*='/explore/'], a[href*='/discovery/item/'], section a[href], [class*='note'] a[href], [class*='card'] a[href]"
      )
    ).filter((anchor) => {
      const href = anchor.getAttribute("href") || "";
      return /\/(?:explore|search_result)\/[0-9a-fA-F]+/.test(href) && !href.includes("/user/profile/");
    });
    return anchors.slice(0, 30).map((anchor) => {
      const element = anchor;
      const container = element.closest("section, div") || element;
      const title =
        element.getAttribute("title") ||
        container.querySelector(".title, [class*='title']")?.textContent ||
        element.textContent ||
        "";
      const img = container.querySelector("img");
      return {
        title: title.trim().replace(/\s+/g, " ").slice(0, 120),
        url: element.getAttribute("href"),
        image: img?.src || "",
        text: container.textContent?.trim().replace(/\s+/g, " ").slice(0, 500) || ""
      };
    });
  });
}

function isUsefulImage(src) {
  return Boolean(src && /^https?:\/\//.test(src) && !src.includes("avatar") && !src.includes("data:image"));
}

async function launchChromium(chromium, headless, warnings, browserInfo) {
  if (process.env.XHS_CDP_URL) {
    browserInfo.engine = "existing-browser";
    browserInfo.executablePath = process.env.XHS_CDP_URL;
    browserInfo.fallbackUsed = true;
    browserInfo.launchMode = "connectOverCDP";
    warnings.push(`小红书使用已打开浏览器：${process.env.XHS_CDP_URL}`);
    return chromium.connectOverCDP(process.env.XHS_CDP_URL);
  }

  const chromeHome = path.join(os.tmpdir(), "travelagent-chrome-home");
  const baseOptions = {
    headless,
    env: {
      ...process.env,
      HOME: chromeHome,
      XDG_CONFIG_HOME: path.join(chromeHome, ".config"),
      XDG_CACHE_HOME: path.join(chromeHome, ".cache")
    },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-crash-reporter",
      "--disable-crashpad",
      "--disable-features=Crashpad"
    ]
  };

  try {
    const bundledExecutablePath = chromium.executablePath();
    return await chromium.launch({
      ...baseOptions,
      ...(existsSync(bundledExecutablePath) ? { executablePath: bundledExecutablePath } : {})
    });
  } catch (error) {
    const candidates = getBrowserCandidates();
    warnings.push(`Playwright 自带 Chromium 不可用：${error.message}`);

    if (process.env.XHS_DISABLE_BROWSER_FALLBACK === "1") {
      throw new Error(`Playwright 自带 Chromium 启动失败，Skill 已禁用本机浏览器回退：${error.message}`);
    }

    for (const candidate of candidates) {
      if (!existsSync(candidate.executablePath)) continue;
      browserInfo.engine = candidate.name;
      browserInfo.executablePath = candidate.executablePath;
      browserInfo.fallbackUsed = true;
      warnings.push(`尝试使用浏览器：${candidate.name} (${candidate.executablePath})`);
      try {
        return await chromium.launch({
          ...baseOptions,
          executablePath: candidate.executablePath
        });
      } catch (candidateError) {
        warnings.push(`${candidate.name} 启动失败：${candidateError.message}`);
      }
    }

    try {
      browserInfo.engine = "Google Chrome channel";
      browserInfo.executablePath = "channel:chrome";
      browserInfo.fallbackUsed = true;
      return await chromium.launch({
        ...baseOptions,
        channel: "chrome"
      });
    } catch (channelError) {
      throw new Error(`无法启动浏览器。Playwright Chromium 失败：${error.message}；候选浏览器均失败；channel=chrome 失败：${channelError.message}`);
    }
  }
}

function getBrowserCandidates() {
  const candidates = [];
  if (process.env.XHS_BROWSER_PATH) {
    candidates.push({
      name: "XHS_BROWSER_PATH",
      executablePath: process.env.XHS_BROWSER_PATH
    });
  }

  candidates.push(
    {
      name: "QQ浏览器",
      executablePath: "/Applications/QQ浏览器.app/Contents/MacOS/QQBrowser"
    },
    {
      name: "QQBrowser",
      executablePath: "/Applications/QQBrowser.app/Contents/MacOS/QQBrowser"
    },
    {
      name: "360极速浏览器",
      executablePath: "/Applications/360极速浏览器.app/Contents/MacOS/360极速浏览器"
    },
    {
      name: "360Chrome",
      executablePath: "/Applications/360Chrome.app/Contents/MacOS/360Chrome"
    },
    {
      name: "夸克",
      executablePath: "/Applications/夸克.app/Contents/MacOS/Quark"
    },
    {
      name: "Quark",
      executablePath: "/Applications/Quark.app/Contents/MacOS/Quark"
    },
    {
      name: "搜狗浏览器",
      executablePath: "/Applications/搜狗浏览器.app/Contents/MacOS/搜狗浏览器"
    },
    {
      name: "Microsoft Edge",
      executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    },
    {
      name: "Google Chrome",
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    }
  );

  return candidates;
}
