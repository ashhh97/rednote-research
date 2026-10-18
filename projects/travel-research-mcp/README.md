# Rednote Research MCP

这是 Rednote Research Skill 的本机 MCP 工具层。它复用仓库里的 Playwright 小红书采集器，由 Codex 作为 host-level MCP 进程启动，不使用 localhost，也不依赖 Codex 沙盒的网络端口。

## Tools

- `xhs_search`: 搜索一个关键词并读取详情。
- `xhs_search_batch`: 批量搜索多个关键词并去重，先建立候选池，再按质量筛选详情。
- `xhs_login_status`: 检查本机登录态文件位置。
- `xhs_login`: 在用户明确同意后打开本机可视浏览器完成一次登录。

批量发现从候选池中按质量筛选 5-10 篇详情；每次返回最多渲染 3 张原始笔记图片。网络响应诊断默认不返回，避免工具结果过大。

搜索结果包括笔记标题、链接、作者、点赞/收藏/评论、图片、正文、登录状态、浏览器信息、网络诊断和警告。前 3 张可访问的笔记图片会作为 MCP `image` 内容块直接返回，Codex 支持时会在对话流中渲染。无法取得的字段保持为空，不编造数据。

## Storage

- 笔记正文不会保存到本地文件。
- 图片会在 MCP 进程内临时读取为内存数据，然后随工具结果返回；WebP 在 macOS 上会短暂写入系统临时目录转换为 PNG，转换后立即删除，不会写入图片缓存目录。
- `storage-state.json` 只保存小红书登录态，不保存笔记内容。
- MCP 默认关闭失败截图。只有设置 `XHS_MCP_DEBUG=1` 时，才会写入诊断截图。
- Codex 对话本身可能保留已经显示的图片；如果完全不希望图片进入对话记录，就只能返回图片 URL，而不能直接渲染图片。

## Codex 配置

在 Codex 的 MCP 配置中增加：

```toml
[mcp_servers.travel-research]
command = "/usr/local/bin/node"
args = ["/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/projects/travel-research-mcp/server.js"]
cwd = "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent"
startup_timeout_sec = 120

[mcp_servers.travel-research.env]
XHS_AUTH_DIR = "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/xhs-auth-test"
XHS_WEB_ORIGIN = "https://www.rednote.com"
PLAYWRIGHT_BROWSERS_PATH = "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/.playwright-browsers"
XHS_DISABLE_BROWSER_FALLBACK = "1"
XHS_SEARCH_TIMEOUT_MS = "15000"
```

Node 路径请用终端执行 `which node` 的结果替换。配置后重启 Codex，在工具列表中应该能看到 `travel-research`。

## Login

MCP 复用 `XHS_AUTH_DIR` 指定的本地 storage state。第一次使用详情采集前，Codex 可以在用户明确要求后调用 `xhs_login` 打开可视浏览器；不要把 `storage-state.json` 提交到 Git，也不要分享给其他人。

## Safety

此 MCP 不绕过验证码、风控或平台安全限制。它只读取用户本机已有的登录态和公开可访问内容，并在遇到限制时返回警告。
