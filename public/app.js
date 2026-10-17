const messages = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const promptInput = document.querySelector("#promptInput");
const sendBtn = document.querySelector("#sendBtn");
const statusEl = document.querySelector("#status");
const template = document.querySelector("#messageTemplate");

const threadId = `local-${Date.now()}`;
let isWorking = false;
let currentJobId = "";
const stageLabels = {
  understanding: "理解需求",
  needs_clarification: "补充信息",
  planning_search: "规划搜索",
  searching: "采集资料",
  extracting_evidence: "抽取资料",
  writing_guide: "生成攻略",
  paused: "已暂停",
  resumed: "已继续",
  canceled: "已终止",
  done: "完成",
  failed: "失败"
};

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    statusEl.textContent = response.ok ? "已连接" : "异常";
  } catch {
    statusEl.textContent = "未连接";
  }
}

function addMessage(role, content, renderExtra) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".avatar").textContent = role === "user" ? "你" : "AI";
  const bubble = node.querySelector(".bubble");
  if (typeof content === "string") {
    bubble.textContent = content;
  } else {
    bubble.append(content);
  }
  if (renderExtra) renderExtra(bubble);
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function addMarkdownMessage(text) {
  const article = document.createElement("div");
  article.className = "rendered-markdown";
  article.innerHTML = renderMarkdown(text);
  addMessage("assistant", article, (bubble) => {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copyRich = document.createElement("button");
    copyRich.type = "button";
    copyRich.textContent = "复制富文本（不含图片）";
    copyRich.addEventListener("click", async () => {
      await copyRenderedContent(article, text);
      copyRich.textContent = "已复制";
    });
    const copyMarkdown = document.createElement("button");
    copyMarkdown.type = "button";
    copyMarkdown.textContent = "复制 Markdown";
    copyMarkdown.addEventListener("click", async () => {
      await navigator.clipboard.writeText(text);
      copyMarkdown.textContent = "已复制";
    });
    actions.append(copyRich, copyMarkdown);
    bubble.append(actions);
  });
}

async function copyRenderedContent(article, markdownText) {
  const exportArticle = article.cloneNode(true);
  exportArticle.querySelectorAll("img").forEach((image) => image.remove());
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${exportArticle.innerHTML}</body></html>`;
  const plain = markdownToPlainText(markdownText);
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      })
    ]);
    return;
  }
  await navigator.clipboard.writeText(plain);
}

function markdownToPlainText(markdownText) {
  return String(markdownText || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1：$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*-\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendChatMessage(message) {
  if (isWorking) return;
  isWorking = true;
  sendBtn.disabled = true;
  const progressView = addProgressMessage();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, message })
    });
    const result = await readJsonResponse(response);
    if (!response.ok || !result.ok) throw new Error(result.error || "处理失败");
    currentJobId = result.jobId;
    attachPauseControl(progressView, currentJobId);
    await pollJob(result.jobId, progressView);
  } catch (error) {
    addMessage("assistant", `处理失败：${error.message}`);
  } finally {
    isWorking = false;
    currentJobId = "";
    sendBtn.disabled = false;
  }
}

function addProgressMessage() {
  const wrapper = document.createElement("div");
  wrapper.className = "progress-card";
  wrapper.innerHTML = `
    <p class="progress-title">正在处理</p>
    <ol class="progress-steps">
      <li data-stage="understanding">理解需求</li>
      <li data-stage="planning_search">规划搜索</li>
      <li data-stage="searching">采集资料</li>
      <li data-stage="extracting_evidence">抽取资料</li>
      <li data-stage="writing_guide">生成攻略</li>
    </ol>
    <p class="progress-detail">任务已开始。</p>
    <div class="progress-actions"></div>
  `;
  addMessage("assistant", wrapper);
  return wrapper;
}

function attachPauseControl(progressView, jobId) {
  const actions = progressView.querySelector(".progress-actions");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pause-btn";
  button.textContent = "暂停";
  button.addEventListener("click", async () => {
    const paused = button.dataset.paused === "true";
    button.disabled = true;
    try {
      await postJobControl(paused ? "/api/chat/resume" : "/api/chat/pause", jobId);
      button.dataset.paused = paused ? "false" : "true";
      button.textContent = paused ? "暂停" : "继续";
    } catch (error) {
      addMessage("assistant", `暂停/继续失败：${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
  actions.append(button);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "cancel-btn";
  cancelButton.textContent = "终止";
  cancelButton.addEventListener("click", async () => {
    cancelButton.disabled = true;
    try {
      await postJobControl("/api/chat/cancel", jobId);
      disableProgressControls(progressView);
      progressView.querySelector(".progress-title").textContent = "已终止";
      progressView.querySelector(".progress-detail").textContent = "任务已终止，可以重新输入需求。";
    } catch (error) {
      addMessage("assistant", `终止失败：${error.message}`);
      cancelButton.disabled = false;
    }
  });
  actions.append(cancelButton);
}

async function postJobControl(path, jobId) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId })
  });
  const result = await readJsonResponse(response);
  if (!response.ok || !result.ok) throw new Error(result.error || "操作失败");
  return result;
}

async function pollJob(jobId, progressView) {
  let lastStage = "";
  while (true) {
    await wait(1000);
    const response = await fetch(`/api/chat/status?jobId=${encodeURIComponent(jobId)}`);
    const job = await readJsonResponse(response);
    if (!response.ok || !job.ok) throw new Error(job.error || "读取进度失败");

    const latest = job.progress[job.progress.length - 1];
    if (latest) {
      updateProgressView(progressView, job.progress);
      if (latest.stage !== lastStage) {
        lastStage = latest.stage;
      }
    }

    if (job.status === "done") {
      updateProgressView(progressView, job.progress, true);
      renderAgentResponse(job.result);
      return;
    }
    syncPauseButton(progressView, job.paused);
    if (job.status === "canceled") {
      updateProgressView(progressView, job.progress, true);
      disableProgressControls(progressView);
      return;
    }
    if (job.status === "failed") {
      updateProgressView(progressView, job.progress);
      throw new Error(job.error || "任务失败");
    }
  }
}

function syncPauseButton(progressView, paused) {
  const button = progressView.querySelector(".pause-btn");
  if (!button) return;
  button.dataset.paused = paused ? "true" : "false";
  button.textContent = paused ? "继续" : "暂停";
}

function disableProgressControls(progressView) {
  progressView.querySelectorAll(".progress-actions button").forEach((button) => {
    button.disabled = true;
  });
}

function updateProgressView(progressView, progress, done = false) {
  const stages = progress.map((item) => item.stage);
  const latest = progress[progress.length - 1];
  progressView.querySelectorAll("[data-stage]").forEach((item) => {
    const stage = item.dataset.stage;
    item.classList.toggle("done", done || stages.includes(stage));
    item.classList.toggle("active", !done && latest?.stage === stage);
  });
  const detail = latest?.message || "任务进行中。";
  progressView.querySelector(".progress-title").textContent = done ? "处理完成" : "正在处理";
  progressView.querySelector(".progress-detail").textContent = detail;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  const lines = String(text || "").split("\n");
  let html = "";
  let inList = false;
  let inSources = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\|/.test(line)) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      const tableLines = [];
      while (index < lines.length && /^\|/.test(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html += renderTable(tableLines);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        html += `<ul${inSources ? ' class="source-list"' : ""}>`;
        inList = true;
      }
      html += `<li>${formatInline(line.replace(/^\s*-\s+/, ""))}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const heading = line.replace(/^#{1,3}\s+/, "");
      if (/资料来源|来源/.test(heading)) inSources = true;
      html += `<h${level}${inSources ? ' class="sources-heading"' : ""}>${formatInline(heading)}</h${level}>`;
    } else if (line.trim()) {
      const paragraphClass = getParagraphClass(line, inSources);
      html += `<p${paragraphClass ? ` class="${paragraphClass}"` : ""}>${formatInline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

function getParagraphClass(line, inSources) {
  if (inSources) return "source-paragraph";
  const clean = line.replace(/\*\*/g, "").trim();
  if (/^(?:Day|D)\s*\d+/i.test(clean)) return "day-heading";
  if (/^\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/.test(clean)) return "time-heading";
  return "";
}

function renderTable(lines) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const [head, ...body] = rows;
  return `
    <div class="table-scroll">
      <table>
        <thead><tr>${head.map((cell) => `<th>${formatInline(cell)}</th>`).join("")}</tr></thead>
        <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/api\/images\/)[^\s)]+)\)/g, '<img class="guide-image" src="$2" alt="$1" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (text.trim() === "Not found") {
      throw new Error("服务端还没加载最新 /api/chat 接口，请重启 npm start 后刷新页面。");
    }
    throw new Error(`服务端返回了非 JSON 内容：${text.slice(0, 120)}`);
  }
}

function renderAgentResponse(result) {
  if (result.type === "clarification") {
    renderClarification(result);
    return;
  }

  if (result.type === "result") {
    addMarkdownMessage(result.guide);
    return;
  }

  addMessage("assistant", result.message || "已处理。");
}

function renderClarification(result) {
  if (result.component === "choice") {
    const wrapper = document.createElement("div");
    wrapper.className = "widget";
    const question = document.createElement("p");
    question.textContent = result.message;
    const choices = document.createElement("div");
    choices.className = "segmented";
    (result.options || []).forEach((option) => {
      const normalized = normalizeOption(option);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-card";
      button.innerHTML = `
        <span class="choice-label">${escapeHtml(normalized.label)}</span>
        ${normalized.description ? `<span class="choice-description">${escapeHtml(normalized.description)}</span>` : ""}
      `;
      button.addEventListener("click", () => {
        wrapper.querySelectorAll("button").forEach((item) => (item.disabled = true));
        addMessage("user", normalized.label);
        sendChatMessage(`${result.field}: ${normalized.value}`);
      });
      choices.append(button);
    });
    wrapper.append(question, choices);
    addMessage("assistant", wrapper);
    return;
  }

  if (result.component === "text_optional") {
    const wrapper = document.createElement("div");
    wrapper.className = "widget";
    const question = document.createElement("p");
    question.textContent = result.message;

    const inputRow = document.createElement("div");
    inputRow.className = "inline-input-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "例如：10点出门，20点结束";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.textContent = "确认";
    inputRow.append(input, submit);

    const choices = document.createElement("div");
    choices.className = "segmented";
    (result.options || []).forEach((option) => {
      const normalized = normalizeOption(option);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-card compact";
      button.innerHTML = `
        <span class="choice-label">${escapeHtml(normalized.label)}</span>
        ${normalized.description ? `<span class="choice-description">${escapeHtml(normalized.description)}</span>` : ""}
      `;
      button.addEventListener("click", () => {
        wrapper.querySelectorAll("button, input").forEach((item) => (item.disabled = true));
        addMessage("user", normalized.label);
        sendChatMessage(`${result.field}: ${normalized.value}`);
      });
      choices.append(button);
    });

    submit.addEventListener("click", () => {
      const value = input.value.trim();
      if (!value) return;
      wrapper.querySelectorAll("button, input").forEach((item) => (item.disabled = true));
      addMessage("user", value);
      sendChatMessage(`${result.field}: ${value}`);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit.click();
    });

    wrapper.append(question, inputRow, choices);
    addMessage("assistant", wrapper);
    input.focus();
    return;
  }

  addMessage("assistant", result.message);
}

function normalizeOption(option) {
  if (typeof option === "string") {
    return { label: option, value: option, description: "" };
  }
  return {
    label: String(option.label || option.value || ""),
    value: String(option.value || option.label || ""),
    description: String(option.description || "")
  };
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text || isWorking) return;
  addMessage("user", text);
  promptInput.value = "";
  sendChatMessage(text);
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 150)}px`;
});

checkHealth();
addMessage("assistant", "你想做哪趟旅行攻略？直接用自然语言告诉我，比如“端午节，济州岛，3天，生成攻略”。");
