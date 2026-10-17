function uniqueFlat(items, key) {
  return Array.from(new Set(items.flatMap((item) => item[key] || []).filter(Boolean)));
}

export function buildDraftFromEvidence(input, evidence, rawSources) {
  const places = uniqueFlat(evidence, "places");
  const restaurants = uniqueFlat(evidence, "restaurants");
  const tips = uniqueFlat(evidence, "tips");
  const imageHints = buildFallbackImageHints(evidence, rawSources);
  const links = evidence.map((item) => `- ${item.title || "资料"}：${item.url}`).join("\n");
  const rawLinks = rawSources.map((item) => `- [${item.platform || item.sourceType || "资料"}] ${item.title || item.keyword || "资料"}：${item.url}`).join("\n");

  return `# ${input.destination}${input.days}天旅游攻略

> 当前为本地 MVP 生成稿。若模型没有跑通，会先用采集到的小红书和网页资料搭出结构。

## P0：生存指南

- 签证/入境：优先使用官网/官方旅游资料确认。
- 支付：待确认当地现金、银行卡、移动支付可用性。
- 交通：优先核对机场到酒店、景点之间的真实用时。
- 饮食饮水：优先参考近期避坑笔记和地图评价。
- 安全和法律：把小红书高频避雷点放到最终版最前面，再用官方/地图资料交叉验证；文化差异、罚款条例、禁忌都需要单独确认。

## 前期准备

- 机票、酒店区域、签证、电话卡/eSIM、保险、必备 App、门票预约都需要逐项确认；有官网链接时要优先保留可点击链接。
- 如果已有酒店地址，下一版可以按酒店位置重新排行程。

## 美食和餐厅

${restaurants.length ? restaurants.map((name) => `- **${name}**：待补充人均、推荐菜、排队情况和是否适合放入当天路线。`).join("\n") : "- 暂未稳定抽取到餐厅；下一版会单独搜索当地必吃、米其林、国民食物和平价小吃。"}

## ${input.days}天分日行程

默认按 **${input.dayStartTime || "09:00"} 出门，${input.dayEndTime || "21:00"} 结束** 安排。景点和餐厅直接融入每天路线。
没有航班信息时，先不安排去机场/从机场出发/机场返程。

${Array.from({ length: input.days }, (_, index) => buildFallbackDay(input, index, places, restaurants, imageHints)).join("\n\n")}

## 交通和预算

- **总预算估算：待确认/人**（当前模型未跑通，下一版会优先给总数，再拆交通、餐饮、门票和备用金）。
- 交通：待结合地图距离、机场/酒店位置和资料中的真实用时确认。
- 预算拆分：待从资料里补充门票、打车、人均餐饮和住宿区间。

## 避坑合集

${tips.length ? tips.map((tip) => `- ${tip}`).join("\n") : "- 待模型从近期笔记中抽取。"}

## 资料来源

${links || rawLinks || "- 暂无资料来源。"}
`;
}

function buildFallbackDay(input, dayIndex, places, restaurants, imageHints) {
  const dayPlaces = places.slice(dayIndex * 2, dayIndex * 2 + 2);
  const dayRestaurant = restaurants[dayIndex] ? [restaurants[dayIndex]] : [];
  const stops = [...dayPlaces, ...dayRestaurant].filter(Boolean);
  if (!stops.length) {
    return `### D${dayIndex + 1}

**${input.dayStartTime || "09:00"}-${input.dayEndTime || "21:00"} 按区域顺路安排**
公交/地铁站：待确认
介绍：当前没有稳定抽取到地点，建议重新运行模型或补充偏好后再排。
`;
  }
  return `### D${dayIndex + 1}

${stops.map((name, stopIndex) => {
  const start = stopIndex === 0 ? input.dayStartTime || "09:00" : `${String(10 + stopIndex * 2).padStart(2, "0")}:30`;
  const end = stopIndex === stops.length - 1 ? input.dayEndTime || "21:00" : `${String(11 + stopIndex * 2).padStart(2, "0")}:30`;
  const images = findImagesForName(name, imageHints);
  const imageText = images.length
    ? images.map((url, index) => `![${name}截图${index + 1}](${url})`).join(" ")
    : "";
  return `**${start}-${end} ${name}**
公交/地铁站：待确认
介绍：${restaurants.includes(name) ? "餐厅/咖啡安排点，推荐菜、人均和排队情况待确认。" : "行程候选地点，具体看点和停留时长待确认。"}
${imageText ? `图片：${imageText}` : ""}`;
}).join("\n\n")}`;
}

function buildFallbackImageHints(evidence, rawSources) {
  const hints = [];
  for (const item of [...(evidence || []), ...(rawSources || [])]) {
    const images = normalizeImages(item.image_refs || item.images).slice(0, 3);
    if (!images.length) continue;
    hints.push({
      names: [
        ...(Array.isArray(item.places) ? item.places : []),
        ...(Array.isArray(item.restaurants) ? item.restaurants : []),
        item.title
      ].filter(Boolean),
      images
    });
  }
  return hints;
}

function findImagesForName(name, imageHints) {
  const exact = imageHints.find((hint) => hint.names.some((item) => item && (item.includes(name) || name.includes(item))));
  const fallback = exact || imageHints.find((hint) => hint.images.length);
  return fallback ? fallback.images.slice(0, 3) : [];
}

function normalizeImages(value) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(new Set(list.filter((item) => typeof item === "string" && /^https?:\/\//.test(item))));
}
