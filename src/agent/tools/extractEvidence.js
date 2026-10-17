import { callModel } from "../../modelClient.js";

export async function extractEvidenceTool({ input, sources }) {
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
      evidence: fallbackEvidence,
      warnings: ["没有采集到可用资料，已生成空资料框架。"],
      usedModel: false
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
5. image_refs 必须保留和该条资料相关的图片 URL，最多 6 张；如果资料里图片明显对应某个地点/餐厅，请在 summary 中说明。
6. 输出 JSON，格式为 {"evidence":[...]}，每条 evidence 包含 title,url,platform,sourceType,places,restaurants,tips,transport,costs,image_refs,summary。

资料：
${JSON.stringify(sources, null, 2)}`;

  try {
    const text = await callModel(modelInput(), prompt, { json: true });
    const parsed = parseJsonObject(text);
    return {
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : fallbackEvidence,
      warnings: [],
      usedModel: true
    };
  } catch (error) {
    return {
      evidence: fallbackEvidence,
      warnings: [`模型抽取失败，已使用基础资料生成：${error.message}`],
      usedModel: false
    };
  }
}

function modelInput() {
  return {
    modelProvider: "deepseek",
    modelBaseUrl: "https://api.deepseek.com",
    modelName: "deepseek-v4-flash",
    apiKey: process.env.DEEPSEEK_API_KEY || ""
  };
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
