#!/usr/bin/env node
const args = parseArgs(process.argv.slice(2));
const baseUrl = String(process.env.TRAVEL_RESEARCH_BRIDGE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

if (args.help || !args.destination) {
  console.log(`Usage:\n  node projects/travel-discovery/scripts/request-bridge.js --destination "花鸟岛" --mode discovery\n\nThe local bridge must be running first:\n  node projects/travel-discovery/bridge/server.js\n`);
  process.exit(args.help ? 0 : 1);
}

let response;
try {
  response = await fetch(`${baseUrl}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      destination: args.destination,
      mode: args.mode || "discovery",
      days: args.days,
      preferences: args.preferences,
      maxNotes: Number(args.maxNotes || 6),
      webPerDimension: Number(args.webPerDimension || 4)
    })
  });
} catch (error) {
  console.error(`无法连接本机旅行资料桥：${baseUrl}。如果当前命令运行在 Codex 沙盒中，localhost 可能被网络隔离；请使用 host-level MCP/桌面连接器，或改用公开网页来源。\n${error.message}`);
  process.exit(2);
}

if (!response.ok || !response.body) {
  console.error(`本机旅行资料桥返回异常：HTTP ${response.status}`);
  process.exit(3);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) if (line.trim()) process.stdout.write(`${line}\n`);
}
if (buffer.trim()) process.stdout.write(`${buffer}\n`);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=");
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith("--")) index += 1;
    result[key] = value === undefined ? true : value;
  }
  return result;
}
