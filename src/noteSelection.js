function parseEngagementCount(value) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return 0;
  if (raw.includes("万")) return number * 10000;
  if (raw.includes("千")) return number * 1000;
  return number;
}

function textFeatures(value) {
  const features = new Set();
  const words = String(value || "").normalize("NFKC").toLowerCase()
    .match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) || [];
  for (const word of words) {
    if (/^[\p{Script=Han}]+$/u.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) {
        features.add(word.slice(index, index + 2));
      }
    } else if (word.length > 1) {
      features.add(word);
    }
  }
  return features;
}

function queryCoverage(query, text) {
  const terms = textFeatures(query);
  if (!terms.size) return 0;
  const matches = textFeatures(text);
  let found = 0;
  for (const term of terms) if (matches.has(term)) found += 1;
  return found / terms.size;
}

function featureOverlap(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const term of left) if (right.has(term)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function scoreNote(note) {
  const title = note.title || "";
  const text = note.text || "";
  const query = note.keyword || "";
  const relevance = Math.round(queryCoverage(query, title) * 22 + queryCoverage(query, text) * 10);
  const completeness = Math.min(12, Math.floor(text.length / 55)) +
    Math.min(6, (note.images || []).length * 2) +
    (note.author ? 2 : 0);
  const stats = note.stats || {};
  const engagement = Math.min(14,
    Math.log10(1 + parseEngagementCount(stats.likedCount)) * 2 +
    Math.log10(1 + parseEngagementCount(stats.collectedCount)) * 2 +
    Math.log10(1 + parseEngagementCount(stats.commentCount))
  );
  const reasons = [];
  if (relevance >= 16) reasons.push("与搜索主题相关");
  if (text.length >= 200 && (note.images || []).length) reasons.push("文字和图片较完整");
  if (engagement >= 5) reasons.push("有互动数据");
  return {
    score: Math.round(relevance + completeness + engagement),
    reasons: reasons.length ? reasons : ["搜索结果可用"],
    titleFeatures: textFeatures(title)
  };
}

export function selectDetailNotes(notes, limit) {
  const candidates = notes.map((note, index) => ({ note, index, ...scoreNote(note) }));
  if (!candidates.length) return { notes: [], selections: [] };

  const strongCount = candidates.filter((candidate) => candidate.score >= 32).length;
  const desiredCount = Math.min(candidates.length, Math.max(5, Math.min(limit, strongCount || 5)));
  const remaining = [...candidates];
  const selected = [];
  const usedAuthors = new Set();

  while (selected.length < desiredCount && remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (const [index, candidate] of remaining.entries()) {
      const author = candidate.note.author || "";
      const authorBonus = author && !usedAuthors.has(author) ? 6 : -8;
      const keywordBonus = selected.some((item) => item.note.keyword === candidate.note.keyword) ? 0 : 4;
      const titleOverlap = selected.length
        ? Math.max(...selected.map((item) => featureOverlap(item.titleFeatures, candidate.titleFeatures)))
        : 0;
      const value = candidate.score + authorBonus + keywordBonus - titleOverlap * 12 - candidate.index * 0.01;
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
