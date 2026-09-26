# Follow-up triage

The `jev-triage` pattern over the firm notes. It answers one question for Joe each week: which firms need a move now, and whose move is it. The output is a ranked list. It never sends, drafts or changes a note.

## Run

```sh
pack/skills/investor-research/triage.sh <investors root>
```

The first line is a count. Then one row per firm: rank, status, days since update, attention score, owner, confidence, and the note's own "next step" line. Firms that would move to `stale` are listed at the end as a proposal. Joe decides.

## What code does

1. Reads every firm folder's `_index.md` frontmatter: `status`, `status_note`, `tier`, `updated`. Category folders are skipped.
2. Finds the first body line that says "next touch", "next step", "next action" or "next move".
3. Computes days since `updated` (Jev does no date arithmetic).
4. Builds one Jev request per 40 firms. Each firm's record sits inside its own two questions, so the verdicts cannot shift between rows.
5. Ranks by attention score, then by days since update. Marks a firm `stale` when it waits on someone for more than the window (`LAURELIN_TRIAGE_STALE_DAYS`, default 30 days) and its status is a waiting or working state.

## What Jev judges

**`attention_<n>`, a Score with three levels**, low to high:

| Level | Situation |
|---|---|
| 0 | Nothing is due. The other side holds the move and the update is recent, or research is complete with no outreach authorized, or the lane is closed. |
| 1 | Something is due this week: a reply to answer, a promised follow-up, or a message unanswered for more than two weeks that needs one check. |
| 2 | Overdue or blocked on Joe: an approval that waits, a reply left unanswered for weeks, or a note that asks for reconciliation or a decision. |

**`owner_<n>`, a Choice**: `joe`, `agent`, `them`, `nobody`.

A firm is marked "needs attention this week" when its attention score is 1.5 or more at confidence 0.6 or more. Under 0.6 the row says `low confidence: ask Joe`.

## Without Jev

Without `TYPESAFE_API_KEY`, the table is sorted by days since update and the first line says Jev was skipped. The stale proposal runs in both cases, because it is code.

## Boundaries

- Reads the vault. Writes nothing. To move a status, Joe or the agent edits the note as a next step and the validator runs.
- Never drafts or sends. A row that says `owner: joe` is a prompt for Joe, not an action.
- Records go to Jev. Jev is an approved vendor for every classification (plan section 20). Contact addresses are not part of the record.
