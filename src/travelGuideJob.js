import { scrapeXiaohongshu } from "./xiaohongshuScraper.js";
import { searchWebSources } from "./webSearch.js";
import { callModel } from "./modelClient.js";
import { buildDraftFromEvidence } from "./writer.js";

function normalizeInput(input) {
  return {
    destination: String(input.destination || "").trim(),
    days: Number(input.days || 5),
    month: String(input.month || "").trim(),
    holiday: String(input.holiday || "").trim(),
    startDate: String(input.startDate || "").trim(),
    endDate: String(input.endDate || "").trim(),
    people: String(input.people || "第一次去，自由行").trim(),
    pace: String(input.pace || "普通").trim(),
    preferences: String(input.preferences || "经典景点、拍照、美食、避坑").trim(),
    maxNotes: Math.max(3, Math.min(Number(input.maxNotes || 12), 30)),
    dayStartTime: String(input.dayStartTime || "09:00").trim(),
    dayEndTime: String(input.dayEndTime || "21:00").trim(),
    headless: input.headless === true,
    modelProvider: String(input.modelProvider || "deepseek"),
    modelBaseUrl: String(input.modelBaseUrl || defaultBaseUrl(input.modelProvider)).replace(/\/$/, ""),
    modelName: String(input.modelName || defaultModelName(input.modelProvider)).trim(),
    apiKey: String(input.apiKey || process.env.DEEPSEEK_API_KEY || "").trim()
  };
}

function defaultBaseUrl(provider) {
  if (provider === "deepseek") return "https://api.deepseek.com";
  return "http://localhost:11434";
}

function defaultModelName(provider) {
  if (provider === "deepseek") return "deepseek-v4-flash";
  return "qwen2.5:7b";
}

export async function runTravelGuideJob(rawInput) {
  const input = normalizeInput(rawInput);
  if (!input.destination || isVagueDestination(input.destination)) {
    throw new Error("目的地还不明确，请输入具体城市、国家或区域。");
  }

  const keywords = [
    `${input.destination} 攻略`,
    `${input.destination} 自由行`,
    `${input.destination} 避雷`,
    `${input.destination} 必去景点`,
    `${input.destination} 美食`,
    `${input.destination} 交通`
  ];

  const scrapeResult = await scrapeXiaohongshu({
    destination: input.destination,
    keywords,
    maxNotes: input.maxNotes,
    headless: input.headless,
    fetchDetails: true
  });

  const webResult = await searchWebSources({
    destination: input.destination,
    preferences: input.preferences,
    maxResults: 10
  });

  const sources = [
    ...scrapeResult.notes.map((note) => ({
      ...note,
      platform: "小红书",
      sourceType: "xiaohongshu",
      priority: 1
    })),
    ...webResult.pages.map((page) => ({
      ...page,
      priority: page.sourceType === "official" ? 2 : 3
    }))
  ];

  const extracted = await extractEvidenceWithModel(input, sources);
  const guide = extracted.usedModel
    ? await writeGuideWithModel(input, extracted.evidence)
    : buildDraftFromEvidence(input, extracted.evidence, sources);

  return {
    ok: true,
    input,
    keywords: {
      xiaohongshu: keywords,
      web: webResult.queries
    },
    scrape: scrapeResult,
    web: webResult,
    evidence: extracted.evidence,
    guide,
    warnings: [
      ...scrapeResult.warnings,
      ...webResult.warnings,
      ...extracted.warnings
    ]
  };
}

function isVagueDestination(value) {
  const normalized = String(value || "").replace(/\s/g, "");
  return ["哪些地方", "哪里", "哪儿", "去哪", "去哪儿", "地方", "目的地", "什么地方"].some((item) =>
    normalized.includes(item)
  );
}

async function extractEvidenceWithModel(input, sources) {
  const fallbackEvidence = sources.map((source, index) => ({
    id: `source_${index + 1}`,
    title: source.title,
    url: source.url,
    platform: source.platform || "网页",
    sourceType: source.sourceType || "web",
    places: [],
    restaurants: [],
    tips: [],
    transport: [],
    costs: [],
    image_refs: source.images || [],
    summary: source.text?.slice(0, 220) || source.snippet || source.title
  }));

  if (!sources.length) {
    return {
      usedModel: false,
      evidence: fallbackEvidence,
      warnings: ["没有采集到可用资料，已生成空资料框架。"]
    };
  }

  const prompt = `你是旅游攻略信息抽取器。请从多来源资料中抽取结构化旅行信息。

目的地：${input.destination}
用户偏好：${input.preferences}

要求：
1. 只基于输入资料，不要编造。
2. 小红书优先用于真实体验、避坑、拍照和餐厅感受；官网/旅游局/票务网站优先用于营业时间、门票、预约、签证等事实。
3. 提取景点、餐厅、交通、费用、避坑、推荐理由、图片线索。
4. 对同一地点合并别名，保留来源链接。
5. sourceType 为 official 的资料用于事实校验；sourceType 为 xiaohongshu 的资料用于体验归纳。
6. 输出 JSON，格式为 {"evidence":[...]}。
7. 每条 evidence 包含 title,url,platform,sourceType,places,restaurants,tips,transport,costs,image_refs,summary。

资料：
${JSON.stringify(sources, null, 2)}`;

  try {
    const text = await callModel(input, prompt, { json: true });
    const parsed = parseJsonObject(text);
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : fallbackEvidence;
    return { usedModel: true, evidence, warnings: [] };
  } catch (error) {
    return {
      usedModel: false,
      evidence: fallbackEvidence,
      warnings: [`模型抽取失败，已使用基础资料生成：${error.message}`]
    };
  }
}

async function writeGuideWithModel(input, evidence) {
  const prompt = `你是用户的旅行攻略助手。请根据资料生成一篇中文旅游攻略。

目的地：${input.destination}
天数：${input.days}
出行月份：${input.month || "未填写"}
节假日/日期：${input.holiday || ""} ${input.startDate || ""}${input.endDate ? ` 至 ${input.endDate}` : ""}
人群：${input.people}
节奏：${input.pace}
偏好：${input.preferences}
每日默认时间：${input.dayStartTime || "09:00"} 出门，${input.dayEndTime || "21:00"} 结束。

写作风格：
- 实战、直接、避坑优先
- 不写空泛介绍
- 信息要能直接放进行程
- 不确定的信息标记“待确认”
- 保留来源链接
- 小红书作为体验来源优先；官网/官方旅游/票务/地图类来源用于事实校验
- 如果小红书和官网信息冲突，写“体验反馈”和“官方信息”两栏，不要混为一个确定结论
- P0 生存指南必须写目的地真实安全风险，如小偷、抢劫、飞车抢劫、夜间安全、诈骗等；无资料支持则标待确认。
- 热门景点和美食餐厅不要单独列章节，直接融入分日行程。
- 分日行程按 ${input.dayStartTime || "09:00"}-${input.dayEndTime || "21:00"} 排，除非用户另有指定。
- 输出 Markdown，重点用 **加粗**。

输出结构：
1. 标题
2. P0 生存指南
3. 前期准备
4. ${input.days}天分日行程（景点和餐厅直接写进每天）
5. 交通和预算
6. 避坑合集
7. 资料来源

资料：
${JSON.stringify(evidence, null, 2)}`;

  return callModel(input, prompt, { json: false });
}

function parseJsonObject(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型没有返回 JSON");
    return JSON.parse(match[0]);
  }
}
