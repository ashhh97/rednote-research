import { createInitialState, buildClarification, buildResult } from "./state.js";
import { understandPromptTool } from "./tools/understandPrompt.js";
import { planSearchTool } from "./tools/planSearch.js";
import { searchSourcesTool } from "./tools/searchSources.js";
import { extractEvidenceTool } from "./tools/extractEvidence.js";
import { writeGuideTool } from "./tools/writeGuide.js";

const sessions = new Map();

export async function runTravelAgentWorkflow({ threadId, message, onProgress }) {
  const existing = sessions.get(threadId);
  if (existing?.status === "needs_clarification" && existing.nextAction) {
    await emitProgress(onProgress, "understanding", "已收到补充信息，继续处理。");
    mergeClarificationAnswer(existing, message);
    return maybeClarifyTripSetup(existing, onProgress);
  }

  const state = createInitialState({ threadId, message });

  state.status = "understanding";
  await emitProgress(onProgress, "understanding", "正在理解你的旅行需求。");
  const understood = await understandPromptTool({ message });
  state.intent = understood.intent;
  state.input = normalizeWorkflowInput(understood);
  state.messages.push({ role: "assistant", content: understood.reply });
  await emitProgress(onProgress, "understanding", understood.reply || "已完成需求理解。");

  if (state.intent === "recommend_destination") {
    await emitProgress(onProgress, "needs_clarification", "需要先补充目的地推荐条件。");
    return buildClarification({
      state,
      field: "recommendation_context",
      question: "你想让我先推荐目的地。请补充出发地、预算、人群和偏好，我会先给候选目的地，再继续生成攻略。",
      component: "text"
    });
  }

  if (!state.input.destination) {
    await emitProgress(onProgress, "needs_clarification", "缺少具体目的地，需要追问。");
    const response = buildClarification({
      state,
      field: "destination",
      question: "我还缺具体目的地。请告诉我城市、国家或区域，比如“济州岛”“新加坡”“关西”。",
      component: "text"
    });
    sessions.set(state.threadId, state);
    return response;
  }

  if (!state.input.days) {
    await emitProgress(onProgress, "needs_clarification", "缺少出行天数，需要追问。");
    const response = buildClarification({
      state,
      field: "days",
      question: "这趟大概玩几天？",
      component: "choice",
      options: ["3天", "5天", "7天", "10天"]
    });
    sessions.set(state.threadId, state);
    return response;
  }

  return maybeClarifyTripSetup(state, onProgress);
}

async function maybeClarifyTripSetup(state, onProgress) {
  if (!state.input.flightQuestionAnswered && !state.input.hasFlightInfo && !state.input.flightPolicy) {
    await emitProgress(onProgress, "needs_clarification", "需要确认是否把飞机行程放进攻略。");
    const response = buildClarification({
      state,
      field: "flight_plan",
      question: "要把飞机行程放进攻略里吗？",
      component: "choice",
      options: [
        {
          label: "是，并加入行程",
          value: "include_flight",
          description: "适合已经订好机票，攻略会安排到达/离开机场衔接。"
        },
        {
          label: "是，暂不加入",
          value: "exclude_flight",
          description: "适合已订机票但现在只想先看城市内路线。"
        },
        {
          label: "未定机票",
          value: "ignore_flight",
          description: "先不考虑飞机行程，避免路线里出现不确定的机场安排。"
        }
      ]
    });
    sessions.set(state.threadId, state);
    return response;
  }

  if (!state.input.timeQuestionAnswered && !state.input.dayStartTimeSpecified) {
    await emitProgress(onProgress, "needs_clarification", "需要确认每天大概几点出门。");
    const response = buildClarification({
      state,
      field: "day_time_preference",
      question: "每天有偏好的出门/结束时间吗？",
      component: "text_optional",
      options: [
        {
          label: "跳过",
          value: "skip_time",
          description: "按默认 09:00 出门，21:00 结束来排。"
        }
      ]
    });
    sessions.set(state.threadId, state);
    return response;
  }

  return continueWorkflow(state, onProgress);
}

async function continueWorkflow(state, onProgress) {
  state.status = "planning_search";
  await emitProgress(onProgress, "planning_search", "正在生成搜索计划。");
  state.searchPlan = await planSearchTool({ input: state.input });
  await emitProgress(onProgress, "planning_search", state.searchPlan.reason || "搜索计划已生成。");

  state.status = "searching";
  await emitProgress(onProgress, "searching", "正在并行搜索小红书和网页资料。");
  const searchResult = await searchSourcesTool({
    input: state.input,
    searchPlan: state.searchPlan,
    onProgress: async (message) => emitProgress(onProgress, "searching", message)
  });
  state.sources = searchResult.sources;
  state.warnings.push(...searchResult.warnings);
  await emitProgress(
    onProgress,
    "searching",
    `资料采集完成：小红书 ${searchResult.xiaohongshu.notes.length} 条，网页 ${searchResult.web.pages.length} 条。`
  );

  state.status = "extracting_evidence";
  await emitProgress(onProgress, "extracting_evidence", "正在抽取景点、餐厅、交通和避坑信息。");
  const extracted = await extractEvidenceTool({
    input: state.input,
    sources: state.sources
  });
  state.evidence = extracted.evidence;
  state.warnings.push(...extracted.warnings);
  await emitProgress(onProgress, "extracting_evidence", `资料抽取完成：${state.evidence.length} 条结构化资料。`);

  state.status = "writing_guide";
  await emitProgress(onProgress, "writing_guide", "正在按你的攻略维度生成正文。");
  state.guide = await writeGuideTool({
    input: state.input,
    evidence: state.evidence,
    sources: state.sources,
    usedModel: extracted.usedModel
  });

  state.guide += `\n\n资料采集：小红书 ${searchResult.xiaohongshu.notes.length} 条，网页 ${searchResult.web.pages.length} 条。`;
  if (state.warnings.length) {
    state.guide += `\n\n提醒：${state.warnings.join("；")}`;
  }
  await emitProgress(onProgress, "done", "攻略生成完成。");

  const result = buildResult({ state });
  sessions.set(state.threadId, state);
  return result;
}

async function emitProgress(onProgress, stage, message) {
  if (!onProgress) return;
  await onProgress({
    stage,
    message,
    at: new Date().toISOString()
  });
}

function normalizeWorkflowInput(understood) {
  const inferredStartTime = understood.dayStartTime || inferTime(understood.rawPrompt || "", "start");
  const inferredEndTime = understood.dayEndTime || inferTime(understood.rawPrompt || "", "end");
  const explicitNoFlight = hasExplicitNoFlightInfo(understood.rawPrompt || "");
  const promptHasFlightInfo = hasFlightInfo(understood.rawPrompt || "");
  return {
    destination: String(understood.destination || "").trim(),
    days: Number(understood.days || 0),
    month: String(understood.month || "").trim(),
    holiday: String(understood.holiday || "").trim(),
    startDate: String(understood.startDate || "").trim(),
    endDate: String(understood.endDate || "").trim(),
    people: String(understood.people || "第一次去，自由行").trim(),
    pace: String(understood.pace || "普通").trim(),
    preferences: Array.isArray(understood.preferences) && understood.preferences.length
      ? understood.preferences.join("、")
      : "经典景点、美食、避坑",
    dayStartTime: String(inferredStartTime || "09:00").trim(),
    dayEndTime: String(inferredEndTime || "21:00").trim(),
    dayStartTimeSpecified: Boolean(inferredStartTime),
    timeQuestionAnswered: Boolean(inferredStartTime),
    hasFlightInfo: promptHasFlightInfo && !explicitNoFlight,
    flightPolicy: explicitNoFlight ? "ignore_flight" : (promptHasFlightInfo ? "include_flight" : ""),
    flightQuestionAnswered: Boolean(explicitNoFlight || promptHasFlightInfo),
    maxNotes: 6,
    webPerDimension: 4,
    headless: false
  };
}

function hasFlightInfo(prompt) {
  return /(航班|飞机|机票|落地|抵达|到达机场|返程|起飞|降落|\b\d{1,2}:\d{2}\b.*(?:机场|飞|航班))/.test(String(prompt || ""));
}

function hasExplicitNoFlightInfo(prompt) {
  return /(不考虑|先不考虑|不用|不要|暂不).{0,8}(飞机|机票|航班|机场)|机票.{0,8}(未定|没定|还没定)/.test(String(prompt || ""));
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

function mergeClarificationAnswer(state, message) {
  const answer = String(message || "").replace(/^[a-z_]+:\s*/i, "").trim();
  const field = state.nextAction.field;
  if (field === "destination") state.input.destination = answer;
  if (field === "days") {
    const match = answer.match(/\d+/);
    state.input.days = match ? Number(match[0]) : Number(answer);
  }
  if (field === "flight_plan") {
    state.input.flightQuestionAnswered = true;
    if (/include_flight|加入/.test(answer)) {
      state.input.flightPolicy = "include_flight";
      state.input.hasFlightInfo = true;
    } else if (/exclude_flight|暂不加入/.test(answer)) {
      state.input.flightPolicy = "exclude_flight";
      state.input.hasFlightInfo = false;
    } else {
      state.input.flightPolicy = "ignore_flight";
      state.input.hasFlightInfo = false;
    }
  }
  if (field === "day_time_preference") {
    state.input.timeQuestionAnswered = true;
    if (!/skip_time|跳过|默认|没有|无|不用/.test(answer)) {
      const start = inferTime(answer, "start") || inferLooseTime(answer, "start");
      const end = inferTime(answer, "end") || inferLooseTime(answer, "end");
      if (start) {
        state.input.dayStartTime = start;
        state.input.dayStartTimeSpecified = true;
      }
      if (end) state.input.dayEndTime = end;
    }
  }
  state.messages.push({ role: "user", content: message });
  state.nextAction = null;
}

function inferLooseTime(prompt, type) {
  const text = String(prompt || "");
  const matches = Array.from(text.matchAll(/(\d{1,2})(?::|点)?(\d{2})?/g));
  const picked = type === "start" ? matches[0] : matches[1];
  if (!picked) return "";
  const hour = Number(picked[1]);
  if (hour < 0 || hour > 23) return "";
  const minute = String(picked[2] || "00").padStart(2, "0");
  return `${String(hour).padStart(2, "0")}:${minute}`;
}
