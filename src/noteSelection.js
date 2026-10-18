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

function promotionSignals(note) {
  const content = `${note.title || ""}\n${note.text || ""}`.normalize("NFKC").toLowerCase();
  const reasons = [];
  let penalty = 0;

  if (/(?:加\s*(?:微|v|vx|微信)|留\s*联系\s*方式|扫码|进群|\+\s*我\s*发\s*你)/i.test(content)) {
    penalty += 6;
    reasons.push("含站外联系引导，已轻度降权");
  }
  if (/(?:报名|拼团|名额有限|收学生|带学生|带队|地陪|包车|一对一)/.test(content) &&
      /(?:私信|私我|联系|报名|收费|价格|名额|接单|招募|可带)/.test(content)) {
    penalty += 4;
    reasons.push("含招揽服务话术，已轻度降权");
  }

  const comments = Array.isArray(note.comments) ? note.comments : [];
  const commentTexts = comments.map((comment) =>
    String(typeof comment === "string" ? comment : comment?.text || comment?.content || "").normalize("NFKC").trim()
  ).filter(Boolean);
  if (commentTexts.length >= 5) {
    const counts = new Map();
    for (const comment of commentTexts) counts.set(comment, (counts.get(comment) || 0) + 1);
    const repeated = Math.max(...counts.values()) >= 3;
    const solicitations = commentTexts.filter((text) => /(?:求发|求一份|私我|加微|加v|进群|扫码)/i.test(text)).length;
    if (repeated || solicitations / commentTexts.length >= 0.6) {
      penalty += 4;
      reasons.push("评论出现重复或集中引流话术，已轻度降权");
    }
  }

  return { penalty, reasons };
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
  const promotion = promotionSignals(note);
  const reasons = [];
  if (relevance >= 16) reasons.push("与搜索主题相关");
  if (text.length >= 200 && (note.images || []).length) reasons.push("文字和图片较完整");
  if (engagement >= 5) reasons.push("有互动数据");
  reasons.push(...promotion.reasons);
  return {
    score: Math.round(relevance + completeness + engagement - promotion.penalty),
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
