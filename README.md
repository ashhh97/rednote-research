# Rednote Research

用你自己的小红书（Rednote）登录态，搜索并阅读笔记详情，然后让 Codex 基于真实笔记做总结。

它适合问：

- “小红书搜索某款防晒霜，读真实使用体验并总结优缺点。”
- “比较几款入门咖啡机的笔记，给我原笔记链接和图片。”
- “小红书搜索苏黎世一日游，按我关心的地点归纳。”

每次研究会先建立候选池，再按搜索主题的相关性、内容完整度和互动数据挑选 **5-10 篇**笔记阅读详情，同时兼顾不同作者和关键词。返回内容会带原笔记链接、每条笔记的赞与收藏（取不到会标明），并展示 **3 张原笔记图片**。按地点、行程、优缺点等方式归纳，请直接写在你的提问里。

### 笔记选择评分规则

工具先给搜索结果卡片打基础分，再选择要打开详情的笔记。基础分最高 **66 分**：

| 项目 | 最高分 | 依据 |
| --- | ---: | --- |
| 与搜索词相关 | 32 | 标题匹配最高 22 分；搜索卡片文字匹配最高 10 分 |
| 卡片信息完整 | 20 | 文字长度最高 12 分；图片最高 6 分；有作者信息 2 分 |
| 互动数据 | 14 | 点赞、收藏、评论数采用对数计分，避免爆款仅凭数字占优 |

选择时还会调整优先级：新作者加 6 分，重复或未知作者减 8 分；覆盖尚未选过的搜索关键词加 4 分；标题与已选笔记越相似，最多减 12 分。相关性仍是主要依据，不按旅行行程打分。通常打开 5-10 篇详情；候选不足时会少于 5 篇。发布时间目前不参与数值评分。

为减少推广内容，卡片中明确引导加微信、扫码、进群等站外联系时减 6 分；招生、带团、包车等说法**同时伴随**私信、报名、收费等招揽话术时减 4 分。它们只降权，不会直接删除笔记。若将来取得至少 5 条评论正文，重复或集中出现引流话术会再减 4 分；**当前采集器只读取评论数，暂时不会触发这一项**。这套规则不能保证识别所有软广。

> 这是一个本机工具：小红书登录态、浏览器和采集过程都在你的电脑上。仓库不会保存你的账号、密码、Cookie 或笔记正文。

## 你需要准备什么

1. 一台 Mac。
2. 已安装 [Node.js](https://nodejs.org/) 20 或更高版本。安装完成后，打开“终端”，输入 `node -v`；看到版本号就表示成功。
3. 已安装 Codex 桌面端。
4. 一个你愿意在网页端登录的小红书账号。保险起见，建议使用不常用、即使受限也不会影响日常使用的账号，不要用主账号。自动化搜索和阅读可能触发平台风控，导致访问受限，严重时可能封号；请遵守小红书的平台规则。这个项目不会绕过验证码、风控或访问限制。

## 第一次安装

### 1. 下载项目

如果你会用终端，在“终端”粘贴：

```bash
git clone https://github.com/ashhh97/rednote-research.git
cd rednote-research
```

也可以在 GitHub 项目页面点击绿色的 **Code** 按钮，选择 **Download ZIP**，解压后在终端进入这个文件夹。

### 2. 安装项目需要的组件

在项目文件夹里运行：

```bash
npm install
npx playwright install chromium
```

第二条命令会下载给采集器使用的浏览器。下载失败时，可以安装 [Google Chrome](https://www.google.com/chrome/)；后面的 Codex 配置会让工具优先使用它。

### 3. 登录一次小红书

先确认你的账号能在哪个网页版正常登录。**登录时打开的网站和后面 Codex 配置的 `XHS_WEB_ORIGIN` 必须相同**；否则即使保存了登录态，搜索时仍可能显示未登录。

| 账号可登录的网站 | 登录命令中的网站地址 | Codex 配置中的 `XHS_WEB_ORIGIN` |
| --- | --- | --- |
| 美区账号常用的 Rednote 网页版 | `https://www.rednote.com` | `https://www.rednote.com` |
| 小红书网页版 | `https://www.xiaohongshu.com` | `https://www.xiaohongshu.com` |

以美区账号为例，仍在项目文件夹中运行：

```bash
XHS_WEB_ORIGIN=https://www.rednote.com XHS_AUTH_DIR=xhs-auth-test PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers node scripts/login-xhs.js --wait=300000
```

如果你的账号只能在 `www.xiaohongshu.com` 登录，把上面命令中的 `https://www.rednote.com` 改成 `https://www.xiaohongshu.com`，并在下面的 Codex 配置中做同样修改。以实际能够登录的站点为准，不要只凭手机号归属地判断。

这会打开一个小红书网页：

1. 用小红书 App 扫码登录，或用网页允许的登录方式完成登录。
2. 登录成功后，**不要立刻关掉终端或浏览器**。
3. 等终端出现 `登录态已保存`，再关掉浏览器窗口。

登录信息只会保存在你电脑的 `xhs-auth-test/storage-state.json`。它已经被 Git 忽略，绝对不要上传、复制或发给其他人。

如果终端显示超时，但网页左侧已经出现“我”或你能打开笔记详情，可以重新运行一次上面的命令，让工具重新检测并保存状态。

## 连接到 Codex

Rednote Research 由两个部分组成：

- **Skill**：告诉 Codex 应该如何筛选笔记、阅读详情和总结。
- **MCP 本机连接器**：在你的电脑上启动 Playwright，并复用你刚刚登录的小红书会话。

### 1. 安装 Skill

在项目文件夹中运行：

```bash
mkdir -p ~/.codex/skills
cp -R "./projects/travel-discovery/skills/rednote-research" ~/.codex/skills/rednote-research
```

### 2. 找到两个本机路径

在终端依次运行：

```bash
pwd
which node
```

第一条会输出“项目绝对路径”，第二条会输出 Node.js 的绝对路径。下一步需要把它们复制进去。

### 3. 编辑 Codex 的 MCP 配置

打开文件：

```text
~/.codex/config.toml
```

在文件末尾粘贴以下内容，并替换所有尖括号里的内容：

```toml
[mcp_servers.travel-research]
command = "<which node 的输出>"
args = ["<项目绝对路径>/projects/travel-research-mcp/server.js"]
cwd = "<项目绝对路径>"
startup_timeout_sec = 120

[mcp_servers.travel-research.env]
XHS_AUTH_DIR = "<项目绝对路径>/xhs-auth-test"
XHS_WEB_ORIGIN = "https://www.rednote.com"
PLAYWRIGHT_BROWSERS_PATH = "<项目绝对路径>/.playwright-browsers"
XHS_BROWSER_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
XHS_DISABLE_BROWSER_FALLBACK = "0"
XHS_SEARCH_TIMEOUT_MS = "15000"
```

例如，`<项目绝对路径>` 如果是 `/Users/you/Documents/rednote-research`，就替换成完整的这段路径。不要保留尖括号。
`XHS_WEB_ORIGIN` 要与第 3 步登录时选择的网站一致。切换网站后，请用新的 `XHS_WEB_ORIGIN` 重新运行登录命令，确认终端再次显示 `登录态已保存`，然后重启 Codex。

### 4. 完全退出并重新打开 Codex

重启后，新开一个 task。技能列表里应出现 **Rednote Research**；Codex 也会有 `travel-research` 工具可调用。

## 开始使用

直接在 Codex 输入自然语言，例如：

```text
小红书搜索某款防晒霜，阅读相关笔记并总结真实使用感、常见优缺点和不同意见。
```

采集时，Codex 会显示类似进度：

```text
已筛选详情笔记 1/8：笔记标题
正在阅读小红书笔记 1/8：笔记标题
```

最终总结会说明基于多少篇笔记、多少篇成功读到详情，并附上原笔记链接、可用互动数据和 3 张原笔记图片。

## 常见问题

### 为什么读不到正文？

小红书可能要求登录、出现安全限制，或临时拒绝访问。请先确认上面的登录步骤已经完成；如果仍失败，隔一段时间再试。工具会明确说明哪些信息没有取得，不会编造笔记内容、点赞数或图片。

### 每次都要重新登录吗？

通常不需要。登录态保存在你的电脑本地；当它自然失效、你主动退出账号，或平台要求重新验证时，才需要再次运行登录命令。

### 图片保存在哪里？

图片只为当前 MCP 调用临时转换和展示；临时文件会在 24 小时后自动清理。Codex 对话本身可能保留已显示的图片，这是 Codex 的对话记录行为。

### 可以把小红书账号密码写进配置吗？

不可以，也不需要。只通过网页扫码/登录完成一次会话保存。不要把 `storage-state.json` 上传到 GitHub。

## 隐私与使用边界

- 不提交、不分享账号密码、Cookie、`storage-state.json`、API Key 或 `.env.local`。
- 不绕过验证码、平台风控或访问限制。
- 互动数据只是热度参考，不代表信息一定正确；重要的票务、营业时间、签证或安全信息，请以官方渠道为准。

## 开发者更新

更新代码后，在项目文件夹运行：

```bash
git pull
npm install
```

如果 Skill 文件有更新，重新运行“安装 Skill”那一小节的复制命令，然后重启 Codex。
