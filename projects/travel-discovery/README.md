# Rednote Research Skill

这是一个多轮旅行探索 Skill。它不会默认直接生成攻略，而是先让用户选择工作方向：

1. 先看大家都去哪里，再筛选 Must Go / 不去 / 备选。
2. 直接生成按维度整理的完整攻略。

Skill 会优先使用小红书/Rednote，再补充马蜂窝、穷游、Lonely Planet、官方旅游网站和其他公开网页。

## 当前版本说明

当前仓库包含“Skill + 本机 localhost 连接桥”的实验实现，但当前 Codex Skill 沙盒不能直接使用它：

```text
Codex Skill
  -> localhost 连接桥
  -> Playwright Chromium
  -> 小红书/网页
  -> JSON 资料
  -> Codex 总结
```

原因是 Codex Skill 与用户终端处在隔离的进程/网络环境中：Skill 不能监听 localhost，也不能访问用户终端里的 localhost。要真正接通，需要 host-level MCP/桌面连接器，不能只靠 Markdown Skill。

## 第一次安装

### 1. 确认项目目录

项目目录是：

```bash
/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent
```

### 2. 安装 Skill

```bash
rm -rf ~/.codex/skills/rednote-research

cp -R "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/projects/travel-discovery/skills/rednote-research" \
  ~/.codex/skills/rednote-research
```

复制完成后重启 Codex。之后新开 Task，直接用自然语言提问，不需要输入 Skill 名称。

例如：

```text
我在杭州，周末想去花鸟岛玩，帮我整理一份攻略推荐。
```

正确的第一步应该是让用户选择：

```text
1. 先看推荐地点
2. 直接生成完整攻略
```

即使用户输入了“帮我生成攻略”，也要先展示这两个方向，除非用户已经明确说“直接生成完整攻略”。

## 本地环境

在终端进入项目目录：

```bash
cd "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent"
```

设置 Skill 使用的环境：

```bash
export TRAVEL_AGENT_ROOT="$PWD"
export XHS_AUTH_DIR=xhs-auth-test
export XHS_WEB_ORIGIN=https://www.rednote.com
export PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers
```

Skill 默认使用连接桥里的无头 Chromium，不会打开可视浏览器窗口。网页端产品仍然可以使用自己的可视 Chromium。

## 启动本机连接桥

本机连接桥可以用于本地网页端或 host-level connector。当前 Codex Skill 不应尝试自动启动它，也不能保证出现原生 Allow / Deny 弹窗；在沙盒中会直接被 localhost 网络隔离拦截。

也可以手动在一个单独的终端窗口启动：

```bash
cd "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent"
node projects/travel-discovery/scripts/ensure-bridge.js
```

启动器会先检查 `127.0.0.1:8787`，已经运行就直接复用；没有运行才会启动连接桥。运行日志和 PID 会写入系统临时目录，不需要额外开放项目目录写权限。

手动前台启动方式：

```bash
cd "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent"

XHS_AUTH_DIR=xhs-auth-test \
XHS_WEB_ORIGIN=https://www.rednote.com \
PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers \
node projects/travel-discovery/bridge/server.js
```

看到下面的提示就表示连接桥已启动：

```text
Travel Research Bridge listening on http://127.0.0.1:8787
```

这个终端窗口需要保持运行。停止时按 `Ctrl+C`。

可以另开一个终端检查：

```bash
curl http://127.0.0.1:8787/health
```

## 小红书登录

### 没有登录态也可以使用

第一次使用不要求先登录小红书。没有登录态时：

- Skill 会先尝试读取公开内容。
- 小红书详情不可用时，最多等待一小段时间。
- 然后自动切换公开网页和官方资料。
- 输出中会明确写“小红书详情未取得”。
- 不会编造小红书链接、图片或点赞数。

### 需要完整小红书详情时

如果希望拿到笔记正文、更多图片、点赞、收藏和评论，需要在本机终端完成一次登录：

```bash
cd "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent"

XHS_AUTH_DIR=xhs-auth-test \
XHS_WEB_ORIGIN=https://www.rednote.com \
PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers \
node scripts/login-xhs.js --wait=300000
```

登录态会保存在：

```text
xhs-auth-test/storage-state.json
```

这个文件只保存在本机，不要提交到 Git，也不要分享给其他人。

## 首次诊断测试

建议先用 1 篇小红书和 1 个网页测试连接层：

```bash
cd "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent"

TRAVEL_AGENT_ROOT="$PWD" \
projects/travel-discovery/archive/run-discovery-search.sh \
  --destination "花鸟岛" \
  --mode discovery \
  --maxNotes 1 \
  --webPerDimension 1 \
  --stream
```

正常情况下会逐行看到：

```text
正在采集分日行程/经典路线
正在阅读小红书笔记 1/1：笔记标题
正在阅读网页 1/1：网页标题
采集完成
```

最后会返回一个 `travel-research.v1` JSON 结果，其中包含来源、图片、链接、互动数据、登录状态和诊断信息。如果显示无法连接 `127.0.0.1:8787`，说明连接桥没有启动或端口被占用。

## 在 Codex 中使用

完成安装后，重启 Codex，新开 Task，直接输入：

```text
我想去花鸟岛玩，先帮我看看大家都去哪些地方，给我图片、小红书链接和点赞数，我先筛选。
```

选择“先看推荐地点”后，继续说：

```text
我一定要去花鸟灯塔和佛手石，不想去婚登广场，喜欢海边、日落和拍照。
```

Skill 会围绕你的选择继续搜索交通、住宿、美食和路线。

## 常见问题

### Codex 一直显示 Running command

先检查本机连接桥的终端是否仍在运行。连接桥会在小红书等待约 15 秒后降级到公开网页，不会无限等待。若仍然卡住，查看最终诊断中的 `browserInfo` 和 `warnings`。

### 出现 Google Chrome 崩溃弹窗

连接桥不应该启动本机可视 Google Chrome。它使用 bundled Playwright Chromium，并且禁止浏览器回退。出现 Chrome 弹窗通常说明：

- 连接桥没有按最新命令启动。
- 调用了网页端或旧版 `xhs-automation` 命令。
- 之前的浏览器进程尚未退出。

重新复制 Skill 后重启 Codex：

```bash
rm -rf ~/.codex/skills/rednote-research
cp -R "/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/projects/travel-discovery/skills/rednote-research" \
  ~/.codex/skills/rednote-research
```

### 小红书没有结果

先确认：

- `XHS_WEB_ORIGIN` 是否为 `https://www.rednote.com`。
- `PLAYWRIGHT_BROWSERS_PATH` 指向的浏览器是否存在。
- 是否需要登录才能读取详情。
- 诊断中的 `authStatus.guest` 是否为 `true`。

没有结果时，Skill 应该继续使用公开网页，并明确说明小红书资料缺失。

### 为什么每个用户不能共享一个小红书账号

登录态包含账号 Cookie 和设备信息，不能放进开源 Skill，也不应该在用户之间共享。每个用户需要使用自己的本机会话；没有登录态的用户则使用公开来源兜底。

## 安全边界

- 不在 Skill 或仓库中保存账号密码、API Key 或 Cookie。
- 不绕过验证码、风控或平台安全限制。
- 不把点赞数当成事实可信度，只作为热度参考。
- 不取得的笔记详情、图片和互动数据必须标记为“未取得”。
- 本机登录态文件只用于本机采集，不提交到版本库。
