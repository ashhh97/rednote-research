# Output Schema

Use `npm run search -- "keyword" --json` to return:

```json
{
  "ok": true,
  "keyword": "济州岛2天攻略",
  "maxNotes": 5,
  "fetchDetails": true,
  "browserInfo": {
    "engine": "playwright-chromium",
    "executablePath": "bundled",
    "fallbackUsed": false,
    "headless": false,
    "launchMode": "launch"
  },
  "authStatus": {
    "checked": true,
    "loggedIn": true,
    "guest": false,
    "userId": "",
    "nickname": ""
  },
  "count": 5,
  "warnings": [],
  "notes": [
    {
      "title": "",
      "url": "",
      "keyword": "",
      "author": "",
      "stats": {},
      "tags": [],
      "images": [],
      "text": ""
    }
  ],
  "summary": ""
}
```

Important fields:

- `notes[].text`: detail text when `--details` succeeds; otherwise search-card text.
- `notes[].images`: image URLs collected from search cards or detail API/DOM.
- `warnings`: collection failures, login status, browser fallback, or detail extraction problems.
- `summary`: Markdown summary from model when configured, otherwise extractive fallback.
