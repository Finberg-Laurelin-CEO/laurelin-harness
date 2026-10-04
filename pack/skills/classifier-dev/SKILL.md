---
name: classifier-dev
description: Sort many texts into labels you name (classifier.dev MCP server `classifier`, Jev underneath, free). Use when reading the inputs is the expensive part: search results, logs, emails, tickets, notes to triage, tag or count. Not for under five items.
---

# classifier-dev

classifier.dev sorts text into labels you name, many texts per call, with a calibrated confidence on every answer. It runs TypeSafe's Jev model. In this harness it is the MCP server `classifier`. Unlike `jev-triage`, which calls TypeSafe's API directly and needs credits, this works on classifier.dev's free tier.

## When to use it

Use it when reading the inputs is the expensive part: search results before you open them, log lines, emails, tickets, changed files, feedback, vault notes. Under about five items you can already see, decide yourself.

| Tool | Use it for |
|---|---|
| `classify_texts` | One label per text, up to 1,000 texts. Triage, routing, filtering. |
| `classify_multi_label` | Every label that applies per text (tagging). Labels scoring 0.7 or more are kept. `max_labels` caps them. |
| `classify_dimensions` | Several named fields per item in one call (for example team, urgency, kind). Up to 1,000 item-by-field decisions. |
| `count_labels` | Only a histogram over a corpus (how many per label, how many unsure). Keeps a thousand answers out of your context. |
| `review_uncertain` | Only the items under a confidence threshold (default 0.7), each with its two likeliest labels and its index. Read these yourself; trust the rest. |

## How to call it

From the Python runtime:

```python
r = await mcp.call_tool("classifier", "classify_texts", {
    "inputs": ["Reply to the investor about the deck", "Fix the failing footer test"],
    "labels": ["email to send or draft", "code change", "research", "scheduling"],
    "instructions": "Classify the task the text asks for.",
})
```

- Labels are free text. Descriptive labels classify better than one-word codes.
- `instructions` defines anything ambiguous about the labels.
- Confidence is calibrated for Jev: answers at 0.9 or above are right about 82 to 92 percent of the time; under 0.5, about 30 to 60 percent. Escalate anything under 0.6 to yourself or to Joe.
- A good pattern for a big batch: `count_labels` for the shape, `classify_texts` for the answers you need, then `review_uncertain` and read only those.

## Privacy

classifier.dev keeps request text for model training unless told not to. The harness connection sends `X-Classifier-Share-Data: false` on every call, so nothing is kept. Never pass `share_data: true`; the server refuses it on this connection with "Conflicting data-sharing choices". Leave `share_data` out.

## Limits

- Free, no key, per IP address: 3,000 classifications a minute on the fast tier, 200 a minute on smart. A 429 says how long to wait.
- `tier: "smart"` re-asks answers under 0.7 of a reasoning model. It is slower and single-label only, and a free smart batch holds at most 200 texts.
- Do not use `url` (scraping) or long-context inputs over 32,000 characters: both need a funded workspace and cost money.

## Not this tool

The harness's own checks (the router, memory ranking, gates) already call Jev through `bin/jev`, with classifier.dev as its fallback. This skill is for the agent's own bulk sorting work.
