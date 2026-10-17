import { callModel } from "../../modelClient.js";
import { buildDraftFromEvidence } from "../../writer.js";

export async function writeGuideTool({ input, evidence, sources, usedModel }) {
  if (!usedModel) {
    return buildDraftFromEvidence(input, evidence, sources);
  }

  const prompt = `你是用户的旅行攻略助手。请根据资料生成一篇中文旅游攻略。

目的地：${input.destination}
天数：${input.days}
出行月份：${input.month || "未填写"}
节假日/日期：${input.holiday || ""} ${input.startDate || ""}${input.endDate ? ` 至 ${input.endDate}` : ""}
人群：${input.people}
节奏：${input.pace}
偏好：${input.preferences}
每日默认时间：${input.dayStartTime || "09:00"} 出门，${input.dayEndTime || "21:00"} 结束。如果用户指定了时间，以用户时间为准。
航班信息：${input.hasFlightInfo ? "用户已提供或提到航班/机场信息，可以纳入行程。" : "用户没有提供航班信息，不要把去机场/离开机场写进每天行程。"}

写作风格：
- 实战、直接、避坑优先
- 不写空泛介绍
- 信息要能直接放进行程
- 不确定的信息标记“待确认”
- 保留来源链接
- 小红书作为体验来源优先；官网/官方旅游/票务/地图类来源用于事实校验
- 如果小红书和官网信息冲突，写“体验反馈”和“官方信息”两栏，不要混为一个确定结论
- P0 生存指南必须包含目的地真实安全风险和文化/法律差异：例如欧洲小偷小摸、巴厘岛飞车抢劫、地铁不能吃喝会罚款、口香糖/烟酒/垃圾/宗教禁忌等；没有资料支持就写“待确认”，不要编造。
- 前期准备涉及官网且有网页版时，给出可点击 Markdown 链接。
- 生存指南里出现的危险区域/风险地点，不要再放进住宿推荐。
- 美食要单独给一个板块：当地必吃、国民食物、米其林/获奖餐厅、平价小吃；同时把合适餐厅融入每天路线。
- 热门景点不要单独列章节，必须直接融入分日行程。
- 分日行程要从 ${input.dayStartTime || "09:00"} 排到 ${input.dayEndTime || "21:00"}，不要用表格，按每天分段输出；同一个地点的信息连续写，不要在“公交/地铁站、介绍、推荐菜、图片”这些行之间空行；只在两个地点之间空一行。
- 时间必须真实：早餐/咖啡通常 25-40 分钟，正餐 45-75 分钟，普通景点 45-90 分钟，大型景点/岛屿/博物馆 2-4 小时；不要机械地每个点都排 1 小时。
- 每个行程点固定使用这个格式：
  **09:00-10:00 地点A**
  公交/地铁站：XXX（如果资料判断打车更合适，就写“建议打车：起点 -> 终点，原因：……”；如果是连续地点，标题写“地点A -> 地点B”，交通也写“XXX -> XXX”）
  介绍：说明为什么去、看什么、是否适合拍照/亲子/情侣/古建/美食等。
  图片：最多插入 3 张和该地点/餐厅相关的 Markdown 图片，格式为 ![地点名截图1](图片URL)。没有可信图片就直接省略图片行，不要写“图片：待补充”，不要用无关图。
- 如果行程点是餐厅/咖啡厅，在一句话介绍后面补充：推荐菜/人均/排队情况/适合安排在哪一餐；资料不足写“待确认”。
- 如果一个时段有链接的两个地点，标题写成“**09:00-10:00 牧志饭团 -> 波上宫**”，交通写“公交/地铁站：XXX -> XXX；”。
- 如果没有航班信息，每天路线不要安排“去机场/从机场出发/机场返程”。攻略最后可以轻量提示“如需航班行程，可后续补充航班后再插入”。
- 交通和预算部分必须先给预算总数，例如“总预算估算：约 ¥X-¥Y/人（不含机票/住宿或注明是否含）”，再拆交通、餐饮、门票、购物/备用金。无法精确时用区间，不要只写“待确认”。
- 输出 Markdown，标题、重点信息用 **加粗**，不要输出转义后的星号。

输出结构：
1. 标题
2. P0 生存指南
3. 前期准备
4. 美食和餐厅
5. ${input.days}天分日行程（景点和餐厅直接写进每天）
6. 交通和预算
7. 避坑合集
8. 资料来源

资料：
${JSON.stringify(evidence, null, 2)}

可用图片素材：
${JSON.stringify(buildImageHints(evidence, sources), null, 2)}`;

  return callModel(modelInput(), prompt, { json: false });
}

function buildImageHints(evidence, sources) {
  const hints = [];
  for (const item of evidence || []) {
    const names = [
      ...(Array.isArray(item.places) ? item.places : []),
      ...(Array.isArray(item.restaurants) ? item.restaurants : []),
      item.title
    ].filter(Boolean);
    const images = normalizeImages(item.image_refs || item.images).slice(0, 3);
    if (names.length && images.length) {
      hints.push({
        names: names.slice(0, 6),
        sourceTitle: item.title || "",
        sourceUrl: item.url || "",
        images
      });
    }
  }
  for (const item of sources || []) {
    const images = normalizeImages(item.images).slice(0, 3);
    if (!images.length) continue;
    hints.push({
      names: [item.title, item.keyword].filter(Boolean).slice(0, 4),
      sourceTitle: item.title || "",
      sourceUrl: item.url || "",
      images
    });
  }
  return hints.slice(0, 80);
}

function normalizeImages(value) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(new Set(list.filter((item) => typeof item === "string" && /^https?:\/\//.test(item))));
}

function modelInput() {
  return {
    modelProvider: "deepseek",
    modelBaseUrl: "https://api.deepseek.com",
    modelName: "deepseek-v4-flash",
    apiKey: process.env.DEEPSEEK_API_KEY || ""
  };
}
