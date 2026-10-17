# 小红书资料源方案

## 方案 A：Playwright 搜索 + 详情页

状态：已验证在稳定登录态下可以拿到详情正文。

流程：

1. 打开小红书搜索页。
2. 监听搜索接口，拿到笔记卡片、图片、作者、互动数据和 `xsec_token`。
3. 用搜索结果详情入口打开笔记。
4. 监听页面详情接口，抽取标题、正文、图片、标签。

优点：

- 能自动搜索帖子。
- 登录态稳定时，详情正文质量好。
- 可以拿到接近真实页面的数据。

限制：

- 依赖登录态时有账号风控风险。
- 新账号或测试账号可能一直是游客态，拿不到详情。
- 不适合作为默认产品链路。

本地测试：

```bash
XHS_AUTH_DIR=xhs-auth-test PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers node scripts/test-xhs.js "济州岛2天攻略" --show --debug --details --login
```

## 方案 B：xhs-reader 思路，免登录详情解析

状态：实验中。

流程：

1. 用公开搜索拿小红书笔记链接。
2. 对每个链接做普通 HTTP 请求。
3. 从 HTML 里的初始化数据或 meta 信息解析标题、正文、图片、标签。
4. 过滤只拿到标题的失败项，必须满足正文长度门槛才进入攻略生成。

优点：

- 默认不使用账号登录态。
- 风险低，更适合产品默认链路。
- 适合把笔记转成 Markdown 后交给 Agent 总结。

限制：

- 不保证每篇公开页面都有完整初始化数据。
- 搜索仍然需要单独解决，详情解析只负责“读链接”。
- 如果只拿到 meta 摘要，需要继续换关键词找更多链接。

本地测试：

```bash
PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers node scripts/test-xhs-reader.js "济州岛2天攻略" --show --debug
```
