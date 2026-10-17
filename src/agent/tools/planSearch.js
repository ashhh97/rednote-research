import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callModel } from "../../modelClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function planSearchTool({ input }) {
  const promptTemplate = await readFile(path.resolve(__dirname, "../prompts/planSearch.md"), "utf8");
  const prompt = `${promptTemplate}

用户需求：
${JSON.stringify(input, null, 2)}`;

  try {
    const text = await callModel(modelInput(), prompt, { json: true });
    const parsed = parseJsonObject(text);
    return {
      xiaohongshu: Array.isArray(parsed.xiaohongshu) ? parsed.xiaohongshu.slice(0, 8) : [],
      web: Array.isArray(parsed.web) ? parsed.web.slice(0, 8) : [],
      reason: String(parsed.reason || "")
    };
  } catch (error) {
    return {
      xiaohongshu: [],
      web: [],
      reason: `搜索计划生成失败，使用默认关键词：${error.message}`
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
