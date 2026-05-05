# API Reference — Civic Hackathon Codes Server

Server runs at `http://localhost:8092`.

---

## POST /api/responses

Store a raw AI tool response for a scenario/query-type cell. The response is written into `data/state.json` and is available immediately for evaluation or comparison.

**Body (JSON):**

| Field | Required | Values |
|---|---|---|
| `scenario` | yes | See valid scenarios below |
| `query_type` | yes | `"generic"` or `"address"` |
| `tool` | yes | Free string — e.g. `"chatgpt"`, `"claude"`, `"gemini"`, `"grok"`, `"perplexity"` |
| `model` | no | Model identifier — e.g. `"gpt-4o"`, `"claude-opus-4-7"` |
| `response` | yes | Raw text response from the AI tool |

**Valid scenarios:** `adu-setbacks`, `business-sign`, `fence-height`, `lot-division`, `roof-permit`, `tiny-house`, `tree-removal`

**Response:**
```json
{ "ok": true, "key": "responses.fence-height.generic.chatgpt" }
```

**Example — Scenario 2, generic query, ChatGPT:**

```bash
curl -s -X POST http://localhost:8092/api/responses \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "fence-height",
    "query_type": "generic",
    "tool": "chatgpt",
    "model": "gpt-4o",
    "response": "In Portland, fence height limits are governed by Title 33 (Zoning Code). In front yards, fences are generally limited to 3.5 feet. In rear and side yards, fences may be up to 6 feet tall. Corner lots have additional restrictions near the sight-distance triangle. You may need a permit for fences over 6 feet. I recommend confirming with the Bureau of Development Services."
  }'
```

The matrix scenario this covers: **Scenario 2 — Fence Height / Generic**, which asks about front/back/side yard fence limits without a specific address.

---

## GET /api/responses

Returns all stored responses, keyed by `scenario → query_type → tool`.

```bash
curl http://localhost:8092/api/responses
```

```json
{
  "fence-height": {
    "generic": {
      "chatgpt": {
        "model": "gpt-4o",
        "response": "..."
      }
    }
  }
}
```

---

## POST /api/evaluate

Score a single query/response pair using the rubric. Returns usefulness (0–3), citation quality (0–3), accuracy flags, and data quality notes.

**Body:**
```json
{ "query": "...", "response": "..." }
```

**Response:**
```json
{
  "usefulness": 2,
  "citation_quality": 1,
  "rationale": "Gave correct height limits but only referenced 'Title 33' without a specific section.",
  "accuracy_flags": ["3.5 ft front-yard limit — verify against Title 33.110.220"],
  "data_quality_notes": "No address-specific data retrieved; general code knowledge only."
}
```

---

## POST /api/compare

Generate a cross-tool comparison report for one query. Pass multiple tool evaluations; returns a markdown report.

**Body:**
```json
{
  "query": "What is the maximum fence height in Portland?",
  "tools": [
    {
      "id": "chatgpt",
      "label": "ChatGPT",
      "model": "gpt-4o",
      "usefulness": 2,
      "citation_quality": 1,
      "rationale": "...",
      "accuracy_flags": ["..."],
      "data_quality_notes": "...",
      "response": "..."
    }
  ]
}
```

---

## GET /api/state

Returns the full `data/state.json` blob.

## POST /api/state

Overwrites `data/state.json` with the posted body. Use `/api/responses` instead for targeted response updates.

---

## Automation pattern

A typical automation script:
1. For each (scenario, query_type) cell, fetch the query text from `examples/{scenario}/{query_type}.md`
2. Send the query to each AI tool API
3. `POST /api/responses` with the raw response
4. `POST /api/evaluate` to score it
5. Store scores back via `POST /api/state` or write directly to `data/state.json`
