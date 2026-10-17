---
name: rednote-research
description: Search Rednote/Xiaohongshu, read selected note details, and summarize real user experiences with source links, images, and engagement data. Use when the user asks to search, read, compare, or summarize Rednote notes.
---

# Rednote Research

Use this skill to research a topic primarily through Xiaohongshu/Rednote notes and turn the findings into an evidence-backed summary. It is a research skill, not a travel-planning workflow: do not force the user through destination selection, food selection, map pinning, or a full itinerary.

## Scope

Accept a natural-language topic such as:

- `小红书搜索苏黎世一日游`
- `读高赞的济州岛咖啡厅笔记，告诉我大家为什么去`
- `总结小红书上大家一般怎么安排瑞士 5 天游`
- `比较这几个笔记里对冲绳亲子游的建议`

If the user has not provided a search target, ask for only the topic or destination. Infer useful query variants yourself; do not make the user provide keywords first.

## Search And Detail Reading

Use the registered `travel-research` MCP server when it is available:

- Use `xhs_search_batch` for 1-3 related first-pass queries.
- Use `xhs_search` for a focused follow-up.
- Use `xhs_login_status` only before claiming a login state.
- Call `xhs_login` only when the user explicitly asks to log in.

For a normal request, retrieve enough search cards to form a varied candidate pool, deduplicate them, then select 5-10 high-quality notes for detail reading. Use the lower end only when results are sparse or highly repetitive; do not always open the first results. Prefer notes with:

- a complete route, D1/D2/D3, list, or other substantive structure;
- useful coverage of different areas, viewpoints, or alternatives;
- available likes, saves, comments, and recent publication;
- diverse authors;
- usable body text and images.

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

## Images

Images are required evidence for every user-facing research summary. Return exactly 3 representative original images from the Rednote notes whenever at least three usable images were obtained. Select images that best illustrate the conclusion and, when possible, draw them from different notes rather than showing three near-duplicates.

- Use the 3-image set for every normal result; when the user asks “图片长什么样”、`配图`、`地点对比` or equivalent, choose the three images around that specific question.
- These must be original images attached to the read notes, not separately searched or generated visuals.
- For independent images of named places, use `xhs_place_images` only when the user specifically asks for place-by-place visuals.
- Render only MCP-provided image blocks or its absolute local `imagePaths`, for example `![灵隐寺](/private/tmp/example.jpg)`.
- Do not use Rednote CDN URLs directly. They expire and commonly render as blank placeholders.
- If fewer than three images are available, show every usable original image and state how many were obtained. If none is available, state `未取得可展示图片`; never reuse an unrelated route cover as a place image.

## Response Format

Start every response with an evidence count using current data only:

> 本次基于 **X 篇小红书笔记**整理，其中 **Y 篇读取了详情页**。

Then adapt the structure to the user’s question. A typical summary should include:

```markdown
## 小红书结论
- 高频共识
- 值得优先看的建议
- 分歧、避坑或不适合的人群

## 值得看
1. [笔记标题](链接) · 作者 · 日期（如有）· 赞/藏/评（如有）
   - 与问题相关的关键信息
2. ...

## 我的归纳
- 清楚说明哪些是多篇共识，哪些仍需核实。

## 原笔记图片
![图片 1](absolute local image path)
![图片 2](absolute local image path)
![图片 3](absolute local image path)
```

For travel topics, you may group findings into `常见路线`、`高频地点`、`餐饮/住宿/交通` or `避坑`, but only when the collected notes support those groups. Do not produce a full day-by-day itinerary unless the user explicitly asks for one after the summary.

## Failure Handling

The MCP server is host-level. Do not start localhost, Chromium, a web server, or shell collector scripts from this skill. Do not repeatedly retry a blocked platform.

If the MCP is unavailable or reports a platform restriction, explain the precise limitation in one sentence and offer to retry later or summarize links supplied by the user.
