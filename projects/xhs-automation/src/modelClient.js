export async function callModel(input, prompt, options = {}) {
  if (input.modelProvider === "ollama") {
    return callOllama(input, prompt, options);
  }
  if (input.modelProvider === "deepseek") {
    return callOpenAICompatible(
      {
        ...input,
        modelBaseUrl: input.modelBaseUrl || "https://api.deepseek.com",
        modelName: input.modelName || "deepseek-v4-flash"
      },
      prompt,
      options
    );
  }
  if (input.modelProvider === "openai-compatible") {
    return callOpenAICompatible(input, prompt, options);
  }
  throw new Error(`暂不支持的模型类型：${input.modelProvider}`);
}

async function callOllama(input, prompt, options) {
  const response = await fetch(`${input.modelBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: input.modelName,
      prompt,
      stream: false,
      format: options.json ? "json" : undefined,
      options: {
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama 调用失败：${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.response || "";
}

async function callOpenAICompatible(input, prompt, options) {
  if (input.modelProvider === "deepseek" && !input.apiKey) {
    throw new Error("DeepSeek API key 未配置，请检查本地 .env.local。");
  }

  const baseUrl = input.modelBaseUrl.replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/v1")
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: input.modelName,
      temperature: 0.2,
      response_format: options.json ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: "你是严谨的中文旅行攻略生成助手。" },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible 调用失败：${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
