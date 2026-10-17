# Prompt 理解案例库

用于训练和优化旅游攻略 Agent 的 Prompt 理解层。每个案例记录用户原始说法、真实搜索路径、隐含决策模式，以及 Agent 应该如何拆解。

## Case 001：城市天数经典路线 + 地图打点

用户路径：

```text
大概搜城市、天数、经典路线
→ 看地图大概分布
→ 找路线周边吃的
→ 备忘录列要去地点和备选地点
```

隐含决策：

- 先找整体路线，不是一开始细搜单点。
- 地图分布决定路线是否成立。
- 输出需要 must-go 和备选点。
- 周边餐饮是路线确定后的补充搜索。
- 如果是自己发起旅行，个人兴趣优先；如果是共同旅行，要合并同行 must-go。

Agent 理解：

```json
{
  "decisionMode": "classic_route_then_map_cluster",
  "mapPlanningNeeded": true,
  "candidatePolicy": "must_go_and_backup",
  "foodSearchTiming": "after_route_cluster",
  "multiPersonMustGoMerge": true
}
```

## Case 002：先搜攻略，再从图片和兴趣里二次细搜

用户路径：

```text
地点 + 想干的事
→ 如果想干的事不明确，就直接搜旅游攻略
→ 图片好玩才会看文字
→ 先搜攻略，再选想玩的，再细搜
```

隐含决策：

- 用户不一定一开始知道偏好，需要从攻略里发现兴趣。
- 图片是进入正文阅读的前置筛选。
- 攻略笔记先用于发现候选活动，细搜用于验证和补充。

Agent 理解：

```json
{
  "decisionMode": "interest_discovery",
  "interestDiscoveryMode": true,
  "imageFirstMode": true,
  "searchPlan": [
    "目的地 旅游攻略",
    "目的地 天数 攻略",
    "目的地 + 候选兴趣点"
  ]
}
```

## Case 003：6天5晚山西晋东南看古建

原始 prompt：

```text
做一个6天5晚山西晋东南看古建的行程
```

显式信息：

- 目的地：山西晋东南
- 天数：6天5晚
- 主题兴趣：古建
- 任务：生成行程

隐含决策：

- 这是主题旅行，不是普通城市经典路线。
- 搜索词要围绕古建、寺庙、石窟、壁画、国保单位、县域交通展开。
- 路线要优先考虑地理分布和交通可达性，因为古建点可能分散在县城/乡镇。
- 需要区分 must-go 古建和顺路备选点。
- 需要关注开放时间、讲解、预约、包车/自驾、县城住宿。

Agent 理解：

```json
{
  "destination": "山西晋东南",
  "days": 6,
  "nights": 5,
  "theme": "古建",
  "decisionMode": "special_theme_route",
  "mapPlanningNeeded": true,
  "candidatePolicy": "must_go_and_backup",
  "transportSensitivity": "high",
  "searchPlanHints": {
    "classicRouteQueries": [
      "山西晋东南 6天5晚 古建 路线",
      "山西 晋东南 古建 攻略",
      "山西古建 自驾 路线 晋东南"
    ],
    "interestMatchQueries": [
      "晋东南 古建 国保",
      "山西 古建 寺庙 壁画",
      "长治 晋城 古建 攻略",
      "高平 古建 攻略",
      "潞城 古建 攻略"
    ],
    "mapClusterQueries": [
      "晋东南 古建 分布 地图",
      "长治 晋城 古建 路线",
      "山西古建 包车 自驾 路线"
    ],
    "verificationQueries": [
      "晋东南 古建 开放时间",
      "山西 古建 预约 讲解",
      "晋东南 古建 交通 住宿"
    ]
  }
}
```

攻略生成要求：

- 不要只列热门景点，要按县域/交通顺路聚类。
- 每天尽量控制跨县移动次数。
- 每个古建点要标注：类型、看点、开放/预约、交通难度、是否 must-go。
- 餐饮和住宿作为路线支撑，不喧宾夺主。
