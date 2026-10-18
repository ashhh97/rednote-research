---
name: rednote-research
description: Search Rednote/Xiaohongshu, read selected note details, and summarize real user experiences with source links, images, and engagement data. Use when the user asks to search, read, compare, or summarize Rednote notes.
---

# Rednote Research

Use this skill to search Xiaohongshu/Rednote notes, read selected details, and answer the user's question with source-backed findings. Apply no default topic, category, or travel workflow; the user's prompt determines what to search and how to organize the answer.

## Scope

Accept a natural-language topic such as:

- `小红书搜索某款防晒霜，看看真实使用感`
- `读高赞的租房避坑笔记，比较大家的建议`
- `总结小红书上关于入门咖啡机的常见评价`
- `比较这几个笔记对同一款产品的不同看法`

If the user has not provided a search target, ask only for the topic. Infer useful query variants yourself; do not make the user provide keywords first.

## Search And Detail Reading

Use the registered `travel-research` MCP server when it is available:

- Use `xhs_search_batch` for 1-3 related first-pass queries.
- Use `xhs_search` for a focused follow-up.
- Use `xhs_login_status` only before claiming a login state.
- Call `xhs_login` only when the user explicitly asks to log in.

For a normal request, retrieve enough search cards to form a varied candidate pool, deduplicate them, then select 5-10 high-quality notes for detail reading. Use the lower end only when results are sparse or highly repetitive; do not always open the first results. Prefer notes with:

- strong relevance to the user's search topic and substantive detail;
- useful coverage of different viewpoints or alternatives;
- available likes, saves, comments, and publication dates where provided;
- diverse authors;
- usable body text and original images.

For requests that explicitly ask for “最高赞” or “高收藏”, give engagement more weight, but still reject thin, duplicate, or stale notes. Engagement is a popularity signal, not proof.

When MCP progress events are available, expose short real-time progress in Codex UI:

```text
已筛选详情笔记 1/N：笔记标题
正在阅读小红书笔记 1/N：笔记标题
```

Repeat for each selected note. Never replace these with a vague “正在处理”.

## Evidence Rules

Base conclusions on detail text whenever it was obtained. Distinguish clearly:

- `近期多篇重复出现`: corroborated across independent notes.
- `单篇笔记提及`: interesting but not corroborated.
- `意见分歧`: notes give materially different advice.
- `待核实`: time-sensitive or unclear information.

Never fabricate note links, authors, dates, images, or interaction metrics. If only a search card was available, say `仅检索卡片，未读取详情`. If collection is blocked, say `小红书详情未取得` and stop there; do not silently replace it with public web research unless the user explicitly asks for other sources.

For every note shown in the source list, always include both `赞：...` and `收藏：...` from that note's `stats.likedCount` and `stats.collectedCount`. If either value is absent, write `未取得` for that field; do not treat missing data as zero. Show `0` only when the source explicitly reports zero. Comments and publication date remain optional.

## Images

Images are required evidence for every user-facing research summary. Return exactly 3 representative original images from the Rednote notes whenever at least three usable images were obtained. Select images that best illustrate the conclusion and, when possible, draw them from different notes rather than showing three near-duplicates.

- Use the 3-image set for every normal result; choose images relevant to the user's actual question.
- These must be original images attached to the read notes, not separately searched or generated visuals.
- Render only MCP-provided image blocks or its absolute local `imagePaths`, for example `![灵隐寺](/private/tmp/example.jpg)`.
- Do not use Rednote CDN URLs directly. They expire and commonly render as blank placeholders.
- If fewer than three images are available, show every usable original image and state how many were obtained. If none is available, state `未取得可展示图片`; never use an unrelated image as evidence.

## Response Format

Start every response with an evidence count using current data only:

> 本次基于 **X 篇小红书笔记**整理，其中 **Y 篇读取了详情页**。

Then adapt the structure to the user’s question. A typical summary should include:

```markdown
## 主要发现
- 与问题直接相关的发现
- 多篇笔记重复出现的看法
- 分歧或局限

## 值得看
1. [笔记标题](链接) · 作者 · 赞：数值或未取得 · 收藏：数值或未取得 · 评论/日期（如有）
   - 与问题相关的关键信息
2. ...

## 归纳
- 清楚说明哪些是多篇共识，哪些仍需核实。

## 原笔记图片
![图片 1](absolute local image path)
![图片 2](absolute local image path)
![图片 3](absolute local image path)
```

Use the categories or comparison dimensions requested in the user's prompt. Do not add a fixed outline for travel, products, food, or any other topic.

## Failure Handling

The MCP server is host-level. Do not start localhost, Chromium, a web server, or shell collector scripts from this skill. Do not repeatedly retry a blocked platform.

If the MCP is unavailable or reports a platform restriction, explain the precise limitation in one sentence and offer to retry later or summarize links supplied by the user.
