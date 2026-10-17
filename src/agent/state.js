export function createInitialState({ threadId, message }) {
  return {
    threadId: threadId || "local-session",
    status: "understanding",
    messages: [{ role: "user", content: message }],
    intent: null,
    input: null,
    searchPlan: null,
    sources: [],
    evidence: [],
    guide: "",
    warnings: [],
    nextAction: null
  };
}

export function buildClarification({ state, field, question, component = "text", options = [] }) {
  state.status = "needs_clarification";
  state.nextAction = { field, question, component, options };
  return {
    ok: true,
    type: "clarification",
    status: state.status,
    threadId: state.threadId,
    message: question,
    component,
    field,
    options,
    state
  };
}

export function buildResult({ state }) {
  state.status = "done";
  return {
    ok: true,
    type: "result",
    status: state.status,
    threadId: state.threadId,
    message: "攻略已生成。",
    guide: state.guide,
    sources: state.sources,
    evidence: state.evidence,
    warnings: state.warnings,
    state
  };
}

export function buildProgress({ state, message }) {
  return {
    ok: true,
    type: "progress",
    status: state.status,
    threadId: state.threadId,
    message,
    state
  };
}
