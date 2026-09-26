# Automation, polling, and errors

## Global flags

Place global flags before the resource command:

```bash
polygres --json --project <project> --no-color <resource> <action>
```

Useful flags:

- `--json`: stable machine-readable stdout;
- `--project`: override the selected project for one command;
- `--no-color`: deterministic human output;
- `--quiet`: suppress non-essential human output;
- `--verbose`: redacted method, path, status, elapsed time, and request ID.

Do not parse verbose stderr as command data. Never request HTTP bodies in
verbose output because they can contain secrets.

## Polling

Project creation waits by default unless `--no-wait` is supplied. CSV import
returns after submission unless `--wait` is supplied.

Polling honors server interval hints and a client timeout. A timeout exits `8`
while the operation can still be running. Retain the resource ID and check
status before retrying.

```bash
polygres projects status <project>
polygres import status <job-id>
```

## Exit codes

| Code | Meaning | Recovery |
| ---: | --- | --- |
| 0 | Success | Continue. |
| 1 | General failure | Read typed error and retained IDs. |
| 2 | Invalid usage or validation | Correct local input before retry. |
| 3 | Authentication required or expired | Run `polygres login`. |
| 4 | Permission denied | Explain required permission or organization/project access. |
| 5 | Resource not found | Verify project/resource ID and active organization. |
| 6 | Conflict or ambiguous selection | Resolve project ambiguity or conflicting state. |
| 7 | Rate limited | Honor retry guidance and avoid rapid retries. |
| 8 | Remote service unavailable or timeout | Check known operation status before resubmission. |
| 9 | Local dependency missing | Install or hand off the missing dependency. |

JSON errors contain `error.code`, `error.message`, `error.details`, and
`request_id` when available. Preserve these fields in the result summary.

For embedding errors, use the specific error code and its recovery guidance.
`EMBEDDING_QUOTA_EXHAUSTED` can use HTTP 429, but progress requires allowance
renewal or authorized funding rather than repeated requests. Check
`polygres --json embeddings usage` and follow
[embeddings.md](embeddings.md#usage-and-recovery). After a text-query timeout,
reuse the same query and idempotency key to recover its existing attempt.

## Non-interactive behavior

Commands do not prompt when all inputs are supplied. A destructive command
without `--yes` can prompt only when stdin is a TTY. In non-interactive mode,
missing confirmation exits `2`.

Do not add `--yes` merely to make automation pass. Obtain approval for the
specific operation first.
