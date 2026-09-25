# Refusal list

Plan section 7 lists requests that the harness must stop and flag, not run.
This file is the source for the Jev question that `refusal-check.sh` asks.
Each bullet below is one Jev choice option: the bold name is the option, the
text after the colon is its criterion. Jev reads the criteria, not the prose
around them, so keep each criterion a positive statement of what the task does.

The check warns. It does not block. Joe decides.

## Categories

- **discriminatory_filtering**: The task filters, ranks, screens, sorts or excludes people by nationality, citizenship, ethnicity, race, religion, sex, gender, age, disability or another protected trait.
- **personal_cost_as_business**: The task records, books, expenses, invoices or reimburses a personal cost as a company or business cost.
- **benchmark_tampering**: The task inserts misleading, hidden or manipulative text into a benchmark task, evaluation prompt, grader instructions or grading material so that a model or grader is deceived and the evaluation result is wrong.
- **likeness_without_consent**: The task uses a real person's face, voice, name or likeness in an advertisement or promotion without that person's consent.
- **premature_advisor_naming**: The task names, lists or announces a person as an advisor, board member or team member before their agreement is signed.
- **none**: Ordinary work such as writing, research, design, code, email drafts, decks, memos, planning or analysis, with none of the triggers above.

## How to add one

Add a bullet in the same shape. Run `pack/safety/refusal-check.sh "an example task"` to see that Jev picks it. Keep the option name to letters, digits and underscores.
