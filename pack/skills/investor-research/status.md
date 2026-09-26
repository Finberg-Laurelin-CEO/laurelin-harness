# Status vocabulary for investor notes

One vocabulary for every new write. The corpus holds four older vocabularies. Notes that already exist keep their old value until someone edits them for another reason. The validator does not check this field.

## The states

The first ten come from the dealflow worker. The last one comes from the playbook and is the resting state for most firms.

| `status:` | Meaning | Who moves next |
|---|---|---|
| `new` | Folder exists. Research has not started. | agent |
| `researching` | Research is in progress. The dossier is not complete. | agent |
| `research-only / no outreach sent` | Research is complete. No outreach is authorized. | nobody, until Joe says |
| `approval-needed` | A message or form is drafted and waits for Joe's approval. | Joe |
| `waiting-on-them` | Joe sent a message or materials. No reply so far. | them |
| `waiting-on-us` | They replied or asked for something. The next move is Joe's. | Joe |
| `diligence` | Calls, data room or reference checks are in progress. | both |
| `stale` | No movement past the window in `triage.md`. Set by triage, never by hand. | Joe decides |
| `closed-pass` | They passed. | nobody |
| `closed-no-fit` | Laurelin ruled them out. | nobody |
| `done` | A check closed, or the relationship is at its end state. | nobody |

Rules:

- One value per note. Detail goes in `status_note:` as free text, never into `status:`.
- Priority is not a status. Put a wave or tier in `tier:`.
- Category and source-list folders keep `status: source container — not a firm`.
- Person notes take the firm's status unless the person's own state differs.
- Move `status:` the same day the state changes. Update `updated:` at the same time.

## Mapping from the old free-text values

Apply this table when a note is edited for another reason. Move the lost detail into `status_note:`.

| Old value pattern | New `status:` | Note |
|---|---|---|
| `research-only / ...` (any suffix) | `research-only / no outreach sent` | Suffix goes to `status_note:` |
| `research-needed` | `researching` | |
| `cold` | `new` | No touch yet |
| `email-scheduled (...)` | `approval-needed` if the send is not verified, else `waiting-on-them` | Check the Email note first |
| `active`, `inbound`, `warm ...` | `waiting-on-us` | |
| `awaiting response`, `sent/read / waiting`, `... follow-up sent ...`, `... passively read ...` | `waiting-on-them` | |
| `post-meeting ...`, `... diligence ...` | `diligence` | |
| `passed`, `... pass ...`, `... lane closed` | `closed-pass` | |
| `hold`, `stalled-warm` | `stale` | Triage confirms or reopens |
| `first-wave candidate`, `second-wave`, `top first-wave target` | `research-only / no outreach sent` | Wave goes to `tier:` |
| `reconciliation-required` | `waiting-on-us` | `status_note: reconcile <what>` |
| `superseded ...`, `website-submission route identified ...` | `research-only / no outreach sent` | Route goes to `status_note:` |
| `source container — not a firm`, `moc`, `playbook`, `working spec` | keep as is | Not firm records |
