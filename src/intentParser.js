import { callModel } from "./modelClient.js";

export async function understandTravelPrompt(rawInput) {
  const prompt = String(rawInput.prompt || "").trim();
  if (!prompt) throw new Error("请输入旅行需求");

  const input = {
    modelProvider: "deepseek",
    modelBaseUrl: "https://api.deepseek.com",
    modelName: "deepseek-v4-flash",
    apiKey: process.env.DEEPSEEK_API_KEY || ""
  };

  const today = new Date().toISOString().slice(0, 10);
  const modelPrompt = `你是旅行产品的语义理解器。请把用户自然语言解析成可用于生成旅游攻略的结构化 JSON。

当前日期：${today}
用户输入：${prompt}

解析规则：
1. 只输出 JSON，不要解释。
2. 如果用户给了明确目的地，如“济州岛”“东京”“意大利南部”，填 destination。
3. 如果用户说“端午节”“国庆”“春节”等节假日，请尽量结合当前日期推断最近未来一次节假日的大致出行月份；如果无法确定精确日期，可以保留 holiday，并把 needs.startDate/endDate 设为 false，只要 days 已明确即可继续生成攻略。
4. 如果用户给了“3天/五天/周末”等时长，填 days。
5. 如果用户没说节奏，默认 pace 为“普通”，不要追问。
6. 如果用户没说偏好，默认 preferences 为 ["经典景点","美食","避坑"]，不要一开始追问。
7. 只有目的地缺失时必须追问；日期不是必须项，天数缺失时可以追问。
8. 如果用户是在问“推荐去哪”，intent 填 recommend_destination，不要伪造 destination。
9. 如果用户提到每天几点出门/开始、几点结束/回酒店，请提取 dayStartTime/dayEndTime；没提就留空。

输出格式：
{
  "intent": "generate_guide" | "recommend_destination",
  "destination": "",
  "days": 0,
  "month": "",
  "holiday": "",
  "startDate": "",
  "endDate": "",
  "people": "第一次去，自由行",
  "pace": "普通",
  "preferences": [],
  "dayStartTime": "",
  "dayEndTime": "",
  "missing": [],
  "confidence": 0.0,
  "reply": "一句简短中文回复，说明已理解什么或还缺什么"
}`;

  try {
    const text = await callModel(input, modelPrompt, { json: true });
    const parsed = parseJsonObject(text);
    return normalizeIntent(parsed, prompt);
  } catch (error) {
    return fallbackUnderstand(prompt, error);
  }
}

function normalizeIntent(parsed, prompt) {
  const destination = String(parsed.destination || "").trim();
  const days = Number(parsed.days || 0);
  const preferences = Array.isArray(parsed.preferences) && parsed.preferences.length
    ? parsed.preferences
    : ["经典景点", "美食", "避坑"];
  const intent = parsed.intent === "recommend_destination" ? "recommend_destination" : "generate_guide";
  const missing = Array.isArray(parsed.missing) ? parsed.missing : [];

  if (intent === "generate_guide" && !destination) missing.push("destination");
  if (intent === "generate_guide" && !days) missing.push("days");

  return {
    ok: true,
    intent,
    destination,
    days,
    month: String(parsed.month || "").trim(),
    holiday: String(parsed.holiday || "").trim(),
    startDate: String(parsed.startDate || "").trim(),
    endDate: String(parsed.endDate || "").trim(),
    people: String(parsed.people || "第一次去，自由行").trim(),
    pace: String(parsed.pace || "普通").trim(),
    preferences,
    dayStartTime: String(parsed.dayStartTime || "").trim(),
    dayEndTime: String(parsed.dayEndTime || "").trim(),
    missing: Array.from(new Set(missing)),
    confidence: Number(parsed.confidence || 0),
    reply: String(parsed.reply || `我理解你想做${destination || "某个目的地"}的旅行攻略。`).trim(),
    rawPrompt: prompt
  };
}

function fallbackUnderstand(prompt, error) {
  const destinationMatch =
    prompt.match(/(?:去|到|游|玩)([\u4e00-\u9fa5A-Za-z\s·-]{2,24})(?:，|,|\s|玩|旅游|旅行|自由行|攻略|行程|$)/) ||
    prompt.match(/([\u4e00-\u9fa5A-Za-z\s·-]{2,24})(?:，|,|\s)*(?:\d{1,2}|[一二三四五六七八九十]+)天/);
  const daysMatch = prompt.match(/(\d{1,2})\s*(?:天|日)/);
  const destination = destinationMatch ? destinationMatch[1].trim() : "";

  return {
    ok: true,
    intent: "generate_guide",
    destination,
    days: daysMatch ? Number(daysMatch[1]) : 0,
    month: prompt.includes("端午") ? "端午节" : "",
    holiday: prompt.includes("端午") ? "端午节" : "",
    startDate: "",
    endDate: "",
    people: "第一次去，自由行",
    pace: "普通",
    preferences: ["经典景点", "美食", "避坑"],
    dayStartTime: inferTime(prompt, "start"),
    dayEndTime: inferTime(prompt, "end"),
    missing: [!destination ? "destination" : "", !daysMatch ? "days" : ""].filter(Boolean),
    confidence: 0.45,
    reply: `模型语义理解暂时失败，我先用基础解析继续。原因：${error.message}`,
    rawPrompt: prompt
  };
}

function inferTime(prompt, type) {
  const text = String(prompt || "");
  const startMatch = text.match(/(?:早上|上午|出门|开始|出发)\s*(\d{1,2})(?::|点)?(\d{2})?/);
  const endMatch = text.match(/(?:晚上|结束|回酒店|收工|回去)\s*(\d{1,2})(?::|点)?(\d{2})?/);
  const match = type === "start" ? startMatch : endMatch;
  if (!match) return "";
  const hour = String(Number(match[1])).padStart(2, "0");
  const minute = String(match[2] || "00").padStart(2, "0");
  return `${hour}:${minute}`;
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
