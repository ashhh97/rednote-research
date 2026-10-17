# XHS Automation

Standalone Xiaohongshu/Rednote search, detail extraction, and summarization tool.

## Run

```bash
cd projects/xhs-automation
XHS_AUTH_DIR=../../xhs-auth-test XHS_WEB_ORIGIN=https://www.rednote.com PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers npm run search -- "济州岛2天攻略" --max=5 --details --show
```

JSON output for agent workflows:

```bash
npm run search -- "济州岛2天攻略" --max=5 --details --json
```

Login helper:

```bash
XHS_AUTH_DIR=../../xhs-auth-test XHS_WEB_ORIGIN=https://www.rednote.com PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers npm run login -- --wait=300000
```

## Notes

- `--details` is important for useful summaries.
- `--show` opens visible Chromium for login/debugging.
- If `DEEPSEEK_API_KEY` is available in `.env.local`, summaries use the model; otherwise the tool falls back to a local extractive summary.
- The bundled Codex skill lives in `skills/xhs-automation`.
