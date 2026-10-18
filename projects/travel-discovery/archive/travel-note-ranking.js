// Preserved travel-specific ranking from the original Rednote collector.
// This module is not used by the general-purpose research skill.
export function selectTravelDetailNotes(notes, limit) {
  const candidates = notes.map((note, index) => {
    const scored = scoreTravelNoteForDetail(note);
    return { note, index, ...scored };
  });
  if (!candidates.length) return { notes: [], selections: [] };

  const strongCount = candidates.filter((candidate) => candidate.score >= 42).length;
  const desiredCount = Math.min(candidates.length, Math.max(5, Math.min(limit, strongCount || 5)));
  const remaining = [...candidates];
  const selected = [];
  const usedAuthors = new Set();

  while (selected.length < desiredCount && remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (const [index, candidate] of remaining.entries()) {
      const author = candidate.note.author || "";
      const authorBonus = author && !usedAuthors.has(author) ? 9 : -12;
      const keywordBonus = selected.some((item) => item.note.keyword === candidate.note.keyword) ? -4 : 5;
      const routeOverlap = selected.length
        ? Math.max(...selected.map((item) => tokenOverlap(item.routeTokens, candidate.routeTokens)))
        : 0;
      const routeBonus = selected.length ? (routeOverlap > 0.55 ? -10 : 7) : 0;
      const value = candidate.score + authorBonus + keywordBonus + routeBonus - candidate.index * 0.01;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    if (chosen.note.author) usedAuthors.add(chosen.note.author);
  }

  return {
    notes: selected.map((candidate) => candidate.note),
    selections: selected.map((candidate) => ({
      title: candidate.note.title || candidate.note.url,
      url: candidate.note.url,
      author: candidate.note.author || "",
      score: candidate.score,
      reasons: candidate.reasons
    }))
  };
}

function scoreTravelNoteForDetail(note) {
  const text = `${note.title || ""}\n${note.text || ""}`;
  const itineraryHits = countMatches(text, /(?:D\s*[1-9]|Day\s*[1-9]|第[一二三四五六七八九十\d]+[天日])/gi);
  const routeHits = countMatches(text, /路线|线路|行程|顺序|环线|交通|地铁|自驾|攻略|玩法/g);
  const routeTokens = extractRouteTokens(text);
  const stats = note.stats || {};
  const likes = parseEngagementCount(stats.likedCount);
  const collects = parseEngagementCount(stats.collectedCount);
  const comments = parseEngagementCount(stats.commentCount);
  const statsScore = Math.min(18, Math.log10(1 + likes) * 4 + Math.log10(1 + collects) * 3 + Math.log10(1 + comments) * 2);
  const completenessScore = Math.min(20, Math.floor((text.length || 0) / 140) + Math.min((note.images || []).length * 2, 8));
  const score = Math.round(
    Math.min(28, itineraryHits * 8 + Math.min(routeHits, 4) * 3) +
    Math.min(18, routeTokens.size * 1.5) +
    statsScore +
    completenessScore +
    freshnessScore(text)
  );
  const reasons = [];
  if (itineraryHits >= 2) reasons.push("含多天分日行程");
  else if (itineraryHits === 1) reasons.push("出现分日安排");
  if (routeHits >= 2) reasons.push("包含路线与交通信息");
  if (routeTokens.size >= 4) reasons.push("覆盖多个地点或区域");
  if (likes || collects || comments) reasons.push("有互动数据");
  if (text.length >= 300 && (note.images || []).length) reasons.push("正文和图片较完整");
  return { score, reasons: reasons.length ? reasons : ["搜索结果可用"], routeTokens };
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function parseEngagementCount(value) {
  const raw = String(value || "").replace(/,/g, "").trim();
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return 0;
  if (raw.includes("万")) return number * 10000;
  if (raw.includes("千")) return number * 1000;
  return number;
}

function extractRouteTokens(text) {
  const stopWords = new Set(["旅游", "攻略", "一日游", "自由行", "打卡", "推荐", "路线", "景点", "交通", "深圳", "广州", "杭州"]);
  return new Set((text.match(/[\u4e00-\u9fff]{2,8}/g) || []).filter((token) => !stopWords.has(token)));
}

function tokenOverlap(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

function freshnessScore(text) {
  const match = text.match(/(?:20\d{2}[年./-])?\d{1,2}[月./-]\d{1,2}/);
  if (!match) return 4;
  const normalized = match[0].replace(/[年月./]/g, "-").replace(/-$/, "");
  const parts = normalized.split("-").map(Number);
  const year = parts.length === 3 ? parts[0] : new Date().getFullYear();
  const month = parts.length === 3 ? parts[1] : parts[0];
  const day = parts.length === 3 ? parts[2] : parts[1];
  const timestamp = new Date(year, month - 1, day).getTime();
  if (!Number.isFinite(timestamp)) return 4;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
  if (ageDays <= 180) return 10;
  if (ageDays <= 730) return 6;
  return 2;
}
