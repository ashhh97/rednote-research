# Archived Travel Conversation Schema

The following schema belonged to the earlier travel-planning workflow. It is retained for a possible future travel-specific skill and is not used by Rednote Research.

```json
{
  "destination": "花鸟岛",
  "trip": {
    "days": null,
    "dates": null,
    "departure_time": null,
    "end_time": null,
    "flight_plan": "unknown",
    "transport_preference": null
  },
  "interests": [],
  "food_must_try": [],
  "food_avoid": [],
  "food_maybe": [],
  "requested_dimensions": [],
  "must_go": [],
  "avoid": [],
  "maybe": [],
  "candidates": [
    {
      "name": "地点名",
      "category": "scenery",
      "route_cluster": "海岛线",
      "reasons": [],
      "images": [],
      "sources": [
        {
          "title": "笔记标题",
          "url": "https://...",
          "author": "作者",
          "published_at": "2026-06-01",
          "stats": {"likes": null, "favorites": null, "comments": null},
          "evidence": "detail text excerpt or extracted facts"
        }
      ],
      "confidence": "high|medium|low|needs_verification"
    }
  ],
  "phase": "understand|entry_choice|departure_time|discover|select_places|food_choice|food_discovery|dimension_choice|full_guide|route|final",
  "direction": "discovery|full_guide|null"
}
```

Do not ask for every nullable field up front. Fill fields from the user's natural language and ask only for information that blocks the current phase.

For source ranking, use this order:

1. Detailed, recent, concrete source with an address or route.
2. Repeated independently across several sources.
3. Official page for rules, opening hours, reservations, and prices.
4. Engagement metrics as a secondary popularity signal.

The source list shown to the traveler should be deterministic: retain the most relevant sources per candidate, deduplicate URLs, and include representative disagreement when sources conflict. The collector can gather more raw items than are displayed.
