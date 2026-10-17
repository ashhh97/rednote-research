import { scrapeXiaohongshu } from "../../xiaohongshuScraper.js";
import { searchWebSources } from "../../webSearch.js";

export async function searchSourcesTool({ input, searchPlan, onProgress }) {
  const dimensionPlans = buildDimensionPlans(input, searchPlan);
  const xhsNotes = [];
  const webPages = [];
  const warnings = [];

  for (const plan of dimensionPlans) {
    if (onProgress) await onProgress(`正在采集【${plan.label}】：准备阅读 6 篇小红书笔记和 4 个网页。`);
    const [xhs, web] = await Promise.all([
      scrapeXiaohongshu({
        destination: input.destination,
        keywords: plan.xiaohongshu,
        maxNotes: input.maxNotes || 6,
        headless: input.headless !== false,
        fetchDetails: true,
        onProgress: async (event) => {
          if (!onProgress) return;
          if (event.type === "detail") {
            await onProgress(`正在阅读【${plan.label}】小红书笔记 ${event.index}/${event.total}：${event.title}`);
          }
        }
      }),
      searchWebSources({
        destination: input.destination,
        preferences: `${input.preferences} ${plan.label}`,
        queries: plan.web,
        maxResults: input.webPerDimension || 4,
        onProgress: async (event) => {
          if (!onProgress) return;
          if (event.type === "page") {
            await onProgress(`正在阅读【${plan.label}】网页 ${event.index}/${event.total}：${event.title}`);
          }
        }
      })
    ]);

    xhsNotes.push(...xhs.notes.map((note) => ({ ...note, researchDimension: plan.id, researchDimensionLabel: plan.label })));
    webPages.push(...web.pages.map((page) => ({ ...page, researchDimension: plan.id, researchDimensionLabel: plan.label })));
    warnings.push(...xhs.warnings, ...web.warnings);
    if (onProgress) await onProgress(`【${plan.label}】采集完成：小红书 ${xhs.notes.length} 条，网页 ${web.pages.length} 条。`);
  }

  const dedupedXhs = dedupeByUrl(xhsNotes);
  const dedupedWeb = dedupeByUrl(webPages);

  const sources = [
    ...dedupedXhs.map((note) => ({
      ...note,
      platform: "小红书",
      sourceType: "xiaohongshu",
      priority: 1
    })),
    ...dedupedWeb.map((page) => ({
      ...page,
      priority: page.sourceType === "official" ? 2 : 3
    }))
  ];

  return {
    sources,
    xiaohongshu: { notes: dedupedXhs },
    web: { pages: dedupedWeb },
    dimensions: dimensionPlans,
    warnings
  };
}

export function buildDimensionPlans(input, searchPlan) {
  const destination = input.destination;
  const days = input.days ? `${input.days}天` : "";
  const year = new Date().getFullYear();
  const dateHint = [input.month, input.holiday, input.startDate ? year : ""].filter(Boolean).join(" ");
  const traveler = input.people || "自由行";
  const preference = input.preferences || "经典路线";

  return [
    {
      id: "survival_safety",
      label: "P0 生存指南/安全风险",
      xiaohongshu: [
        `${destination} 安全 避雷`,
        `${destination} 危险 小偷 抢劫`,
        `${destination} 骗局 飞车抢劫 小偷小摸`,
        `${destination} 文化差异 法律 罚款 禁忌`,
        `${destination} 自由行 安全 注意事项 ${dateHint}`,
        ...(searchPlan?.xiaohongshu || []).filter((item) => /避雷|避坑|安全|危险|骗局/.test(item)).slice(0, 2)
      ],
      web: [
        `${destination} travel safety scams theft ${year}`,
        `${destination} laws fines cultural etiquette tourists ${year}`,
        `${destination} 安全 风险 旅游 注意事项 ${year}`,
        `${destination} 官方 旅游 安全 法律 罚款`,
        `${destination} 避雷 避坑 攻略`
      ]
    },
    {
      id: "preparation",
      label: "前期准备/入境支付通信预约",
      xiaohongshu: [
        `${destination} 自由行 准备 清单`,
        `${destination} 入境 签证 支付 电话卡`,
        `${destination} 住宿 区域 推荐`,
        `${destination} 门票 预约 攻略 ${dateHint}`,
        ...(searchPlan?.xiaohongshu || []).filter((item) => /准备|签证|入境|住宿|预约|电话卡|支付/.test(item)).slice(0, 2)
      ],
      web: [
        `${destination} 官方 入境 签证 支付 交通`,
        `${destination} official tourism tickets opening hours`,
        `site:mafengwo.cn ${destination} 自由行 准备 住宿`,
        `site:qyer.com ${destination} 签证 交通 住宿`
      ]
    },
    {
      id: "itinerary_route",
      label: "分日行程/经典路线/区域顺路",
      xiaohongshu: [
        `${destination} ${days} 攻略 经典路线`,
        `${destination} ${days} 行程 直接抄`,
        `${destination} ${days} 路线 地图 分区`,
        `${destination} ${preference} 路线 顺路`,
        ...(searchPlan?.xiaohongshu || []).slice(0, 3)
      ],
      web: [
        `${destination} ${days} itinerary attractions transport`,
        `site:mafengwo.cn ${destination} ${days} 行程 路线`,
        `site:qyer.com ${destination} ${days} 攻略 路线`,
        `site:lonelyplanet.com ${destination} travel guide attractions`
      ]
    },
    {
      id: "food",
      label: "美食/餐厅/米其林/国民食物",
      xiaohongshu: [
        `${destination} 必吃 美食`,
        `${destination} 美食地图 餐厅`,
        `${destination} 米其林 餐厅`,
        `${destination} 国民食物 小吃`,
        `${destination} ${days} 路线 周边吃的`,
        ...(searchPlan?.xiaohongshu || []).filter((item) => /美食|餐厅|咖啡|米其林|小吃|吃/.test(item)).slice(0, 2)
      ],
      web: [
        `${destination} must eat food Michelin local dishes`,
        `${destination} best restaurants local food`,
        `site:mafengwo.cn ${destination} 美食 餐厅`,
        `site:qyer.com ${destination} 美食 必吃`
      ]
    },
    {
      id: "transport_budget",
      label: "交通/预算/时间安排",
      xiaohongshu: [
        `${destination} 交通 攻略 打车 公交`,
        `${destination} ${preference} 交通 路线 打车 公交`,
        `${destination} ${days} 费用 预算`,
        `${destination} 机场 酒店 交通`,
        `${destination} ${traveler} 人均 花费`,
        ...(searchPlan?.xiaohongshu || []).filter((item) => /交通|费用|预算|机场|酒店|人均/.test(item)).slice(0, 2)
      ],
      web: [
        `${destination} public transport airport hotel fare`,
        `${destination} ${preference} transport route`,
        `${destination} travel budget cost ${year}`,
        `${destination} 交通 机场 市区 费用`,
        `site:mafengwo.cn ${destination} 交通 费用`
      ]
    }
  ].map((plan) => ({
    ...plan,
    xiaohongshu: Array.from(new Set(plan.xiaohongshu.filter(Boolean))).slice(0, 6),
    web: Array.from(new Set(plan.web.filter(Boolean))).slice(0, 4)
  }));
}

function dedupeByUrl(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.url || item.title;
    if (!key || seen.has(key)) continue;
    seen.set(key, item);
  }
  return Array.from(seen.values());
}
