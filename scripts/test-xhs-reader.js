import { readXhsNotePublic } from "../src/xhsReaderParser.js";
import { searchXhsLinksViaWeb } from "../src/xhsLinkSearch.js";

const keyword = process.argv[2] || "济州岛2天攻略";
const maxNotes = Number(process.argv.find((arg) => arg.startsWith("--max="))?.split("=")[1] || 5);

const search = await searchXhsLinksViaWeb(keyword, { maxLinks: maxNotes });

const parsed = [];
for (const note of search.links.slice(0, maxNotes)) {
  const detail = await readXhsNotePublic(note.url);
  parsed.push({
    searchTitle: note.title,
    url: note.url,
    status: detail.status,
    htmlLength: detail.htmlLength,
    title: detail.title || note.title,
    author: detail.author,
    textLength: detail.text.length,
    text: detail.text.slice(0, 700),
    tags: detail.tags,
    images: detail.images.slice(0, 3),
    source: detail.source,
    warnings: detail.warnings
  });
}

console.log(JSON.stringify({
  keyword,
  provider: "xhs-reader-style-public-html",
  searchMode: "web-search-links",
  searchQueries: search.queries,
  searchCount: search.links.length,
  validDetailCount: parsed.filter((note) => note.textLength > 120).length,
  searchWarnings: search.warnings,
  notes: parsed
}, null, 2));
