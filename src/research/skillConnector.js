import { scrapeXiaohongshu } from "../xiaohongshuScraper.js";
import { searchWebSources } from "../webSearch.js";
import { buildDimensionPlans } from "../agent/tools/searchSources.js";

// Stable boundary for the Codex Skill. It deliberately does not import the
// web app workflow, session map, progress controls, or UI state.
export async function searchTravelSourcesForSkill({
  destination,
  days = 0,
  preferences = "经典景点、美食、避坑",
  maxNotes = 6,
  webPerDimension = 4,
  headless = process.env.TRAVEL_DISCOVERY_HEADLESS !== "0",
  mode = "discovery",
  onProgress
}) {
  const input = {
    destination: String(destination || "").trim(),
    days: Number(days || 0),
    preferences: String(preferences || "经典景点、美食、避坑"),
    people: "自由行",
    pace: "普通",
    month: "",
    holiday: "",
    startDate: ""
  };
  if (!input.destination) throw new Error("destination is required");

  const allPlans = buildDimensionPlans(input, { xiaohongshu: [], web: [] });
  const plans = mode === "full"
    ? allPlans
    : allPlans.filter((plan) => ["itinerary_route", "food"].includes(plan.id)).slice(0, 1);
  const notes = [];
  const pages = [];
  const warnings = [];
  const diagnosticRuns = [];

  for (const plan of plans) {
    await report(onProgress, `正在采集【${plan.label}】：准备阅读 ${maxNotes} 篇小红书笔记和 ${webPerDimension} 个网页。`);
    const [xhs, web] = await Promise.all([
      scrapeXiaohongshu({
        destination: input.destination,
        keywords: plan.xiaohongshu,
        maxNotes,
        headless,
        debug: true,
        fetchDetails: true,
        onProgress: async (event) => {
          if (event.type === "detail") {
            await report(onProgress, `正在阅读【${plan.label}】小红书笔记 ${event.index}/${event.total}：${event.title}`);
          }
        }
      }).catch((error) => failedXhsResult(error)),
      searchWebSources({
        destination: input.destination,
        preferences: `${input.preferences} ${plan.label}`,
        queries: plan.web,
        maxResults: webPerDimension,
        onProgress: async (event) => {
          if (event.type === "page") {
            await report(onProgress, `正在阅读【${plan.label}】网页 ${event.index}/${event.total}：${event.title}`);
          }
        }
      }).catch((error) => failedWebResult(error))
    ]);

    diagnosticRuns.push({
      dimension: plan.id,
      browserInfo: xhs.browserInfo || null,
      authStatus: xhs.authStatus || null,
      warnings: xhs.warnings || [],
      diagnostics: xhs.diagnostics || [],
      networkDiagnostics: xhs.networkDiagnostics || []
    });

    notes.push(...xhs.notes.map((note) => ({
      ...note,
      platform: "小红书",
      sourceType: "xiaohongshu",
      researchDimension: plan.id,
      researchDimensionLabel: plan.label
    })));
    pages.push(...web.pages.map((page) => ({
      ...page,
      researchDimension: plan.id,
      researchDimensionLabel: plan.label
    })));
    warnings.push(...xhs.warnings, ...web.warnings);
    if (!xhs.notes.length) {
      await report(onProgress, "小红书本轮没有拿到可核验笔记，已切换公开网页补足；不会编造小红书链接或热度。");
    }
    await report(onProgress, `【${plan.label}】采集完成：小红书 ${xhs.notes.length} 条，网页 ${web.pages.length} 条。`);
  }

  return {
    contractVersion: "travel-research.v1",
    adapter: "skill",
    mode,
    destination: input.destination,
    sources: dedupe([...notes, ...pages]),
    counts: {
      xiaohongshu: dedupe(notes).length,
      web: dedupe(pages).length
    },
    diagnostics: {
      xiaohongshu: diagnosticRuns
    },
    warnings
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || `${item.sourceType}:${item.title}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function report(onProgress, message) {
  if (onProgress) await onProgress(message);
}

function failedXhsResult(error) {
  return {
    notes: [],
    browserInfo: null,
    authStatus: null,
    diagnostics: [],
    networkDiagnostics: [],
    warnings: [`Skill 小红书采集异常：${error?.stack || error?.message || error}`]
  };
}

function failedWebResult(error) {
  return {
    pages: [],
    warnings: [`Skill 网页采集异常：${error?.stack || error?.message || error}`]
  };
}
