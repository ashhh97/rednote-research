import { callModel } from "./modelClient.js";

export async function summarizeXhsNotes({ keyword, notes, useModel = true }) {
  if (!useModel || !process.env.DEEPSEEK_API_KEY) {
    return buildExtractiveSummary({ keyword, notes });
  }

  const prompt = `你是小红书资料分析助手。请只基于输入笔记，提炼用户可用的信息。

关键词：${keyword}

要求：
1. 输出 Markdown。
2. 先给 5-8 条要点总结。
3. 再列出高频地点/餐厅/路线/避坑。
4. 最后逐条列出笔记来源，包含标题、链接、图片数量、正文摘要。
5. 不要编造输入中没有的信息。

笔记：
${JSON.stringify(notes.map(normalizeNoteForPrompt), null, 2)}`;

  try {
    return await callModel(modelInput(), prompt, { json: false });
  } catch (error) {
    const fallback = buildExtractiveSummary({ keyword, notes });
    return `${fallback}\n\n> 模型总结失败，已使用本地摘要兜底：${error.message}`;
  }
}

export function buildExtractiveSummary({ keyword, notes }) {
  const lines = [];
  lines.push(`# 小红书资料摘要：${keyword}`);
  lines.push("");
  lines.push(`采集笔记：${notes.length} 条`);
  lines.push("");
  lines.push("## 要点");
  for (const note of notes.slice(0, 8)) {
    const snippet = cleanText(note.text || note.title).slice(0, 180);
    lines.push(`- **${note.title || "未命名笔记"}**：${snippet || "暂无正文"}${note.images?.length ? `（图片 ${note.images.length} 张）` : ""}`);
  }
  lines.push("");
  lines.push("## 来源");
  for (const note of notes) {
    lines.push(`- [${note.title || note.url}](${note.url})`);
  }
  return lines.join("\n");
}

function normalizeNoteForPrompt(note) {
  return {
    title: note.title || "",
    url: note.url || "",
    author: note.author || "",
    stats: note.stats || {},
    tags: note.tags || [],
    imageCount: Array.isArray(note.images) ? note.images.length : 0,
    images: Array.isArray(note.images) ? note.images.slice(0, 3) : [],
    text: cleanText(note.text || "").slice(0, 1600)
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function modelInput() {
  return {
    modelProvider: "deepseek",
    modelBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    modelName: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    apiKey: process.env.DEEPSEEK_API_KEY || ""
  };
}
