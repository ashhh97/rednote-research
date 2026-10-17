---
name: xhs-automation
description: Automate Xiaohongshu/Rednote search and note-detail extraction with Playwright, then summarize collected notes. Use when Codex needs to search 小红书/Rednote by keyword, collect note titles, links, images, authors, stats, tags, and detail text, debug login/browser issues, or produce JSON/Markdown summaries from 小红书 notes.
---

# XHS Automation

## Quick Start

Run the standalone project CLI from the repository root:

```bash
cd projects/xhs-automation
XHS_AUTH_DIR=../../xhs-auth-test XHS_WEB_ORIGIN=https://www.rednote.com PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers npm run search -- "济州岛2天攻略" --max=5 --details --show
```

Use `--json` when the caller needs structured output for another workflow:

```bash
npm run search -- "济州岛2天攻略" --max=5 --details --json
```

## Workflow

1. Prefer `XHS_WEB_ORIGIN=https://www.rednote.com` for current Rednote web flows.
2. Use `XHS_AUTH_DIR` to point at an existing logged-in storage state when detail pages require login.
3. Use `--show` for visible Chromium when debugging login, page loading, or risk prompts.
4. Use `--details` for AI-ready summaries; search-card-only output is usually too thin for route or guide synthesis.
5. Use `--json` for downstream agents; use Markdown output for human review.

## Options

- `--max=5`: number of notes to collect.
- `--details`: open detail pages and extract text/images.
- `--show`: run visible Chromium; omit for headless.
- `--debug`: include diagnostics and screenshots when collection fails.
- `--login --wait=120000`: wait for manual login and save storage state.
- `--no-model`: skip model summary and use extractive local summary.
- `--json`: print raw notes plus summary as JSON.

## Safety And Reliability

- Do not attempt to bypass platform security or anti-abuse systems.
- Keep browsing slow and visible for debugging when accounts receive warnings.
- Treat Xiaohongshu as a high-value source, not the only source; fall back to other web sources when login or detail extraction fails.
- If images fail to render by direct CDN URL, use a product-side image proxy/cache rather than retrying aggressively.

## References

Read `references/output-schema.md` when another agent needs the JSON shape or wants to integrate the collector into a larger workflow.
