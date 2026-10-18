import test from "node:test";
import assert from "node:assert/strict";
import { selectDetailNotes } from "../src/noteSelection.js";

function note(title, keyword, author, likes = "0") {
  return {
    title,
    keyword,
    author,
    url: `https://www.rednote.com/explore/${title}`,
    text: title.repeat(4),
    images: ["https://example.com/image.jpg"],
    stats: { likedCount: likes, collectedCount: "3", commentCount: "1" }
  };
}

test("topic relevance outranks travel vocabulary and popularity", () => {
  const notes = [
    note("苏黎世三日行程路线攻略", "防晒霜使用感", "旅行作者", "8万"),
    note("这款防晒霜使用感清爽", "防晒霜使用感", "护肤作者", "30")
  ];
  const result = selectDetailNotes(notes, 5);
  assert.equal(result.notes[0].author, "护肤作者");
  assert.ok(result.selections[0].reasons.includes("与搜索主题相关"));
});

test("selection spans queries and favors different authors", () => {
  const notes = [
    note("咖啡机噪音评测", "咖啡机噪音", "甲", "500"),
    note("咖啡机噪音实际体验", "咖啡机噪音", "甲", "450"),
    note("咖啡机噪音对比", "咖啡机噪音", "乙", "400"),
    note("咖啡机清洗心得", "咖啡机清洗", "丙", "350"),
    note("咖啡机清洗步骤", "咖啡机清洗", "丁", "300")
  ];
  const result = selectDetailNotes(notes, 5);
  assert.equal(result.notes.length, 5);
  assert.equal(new Set(result.notes.map((item) => item.keyword)).size, 2);
  assert.notEqual(result.notes[0].author, result.notes[1].author);
});

test("selection stays within available notes and the requested limit", () => {
  assert.equal(selectDetailNotes([], 10).notes.length, 0);
  assert.equal(selectDetailNotes([note("护肤体验", "护肤", "甲")], 10).notes.length, 1);
  const notes = Array.from({ length: 15 }, (_, index) => note(`护肤体验${index}`, "护肤", `作者${index}`));
  assert.ok(selectDetailNotes(notes, 10).notes.length <= 10);
});
