import { scrapeXiaohongshu } from "../src/xiaohongshuScraper.js";

const keyword = process.argv[2] || "济州岛咖啡厅";
const headless = process.argv.includes("--show") ? false : true;
const debug = process.argv.includes("--debug");
const loginWaitMs = process.argv.includes("--login") ? 120000 : 0;
const fetchDetails = process.argv.includes("--details");
const result = await scrapeXiaohongshu({
  keywords: [keyword],
  maxNotes: 5,
  headless,
  debug,
  loginWaitMs,
  fetchDetails
});

console.log(
  JSON.stringify(
    {
      keyword,
      headless,
      debug,
      fetchDetails,
      loginWaitMs,
      browserInfo: result.browserInfo,
      authStatus: result.authStatus,
      count: result.notes.length,
      warnings: result.warnings,
      diagnostics: result.diagnostics,
      networkDiagnostics: result.networkDiagnostics,
      notes: result.notes.map((note) => ({
        title: note.title,
        url: note.url,
        hasXsecToken: Boolean(note.xsecToken),
        author: note.author,
        stats: note.stats,
        tags: note.tags,
        images: (note.images || []).slice(0, 2),
        text: (note.text || "").slice(0, 160)
      }))
    },
    null,
    2
  )
);
