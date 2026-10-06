# speed

Make the harness start work faster (Joe: "very slow and slower than standard claude code"). Merge to main only on Joe's say.

Measured before (main), on the real vault: memory took 11 to 13 s before the model started, almost all of it one Polygres search; routing added 1 to 2 s more, one after the other.

- Warm search server: `query.py --serve` stays running and keeps the local index in memory (notes re-checked at most every 30 s). A local search drops from about 1.1 s to about 25 ms.
- Lanes in tandem: local index, Polygres text search, and (deep mode) Polygres vector search start together, on the threads of the warm server. Whatever is in by the budget is used (default 2 s; deep 9 s), merged by reciprocal rank.
- Polygres vector search takes 6 to 9 s because Polygres embeds the query server-side. Our own embedding would fix it, but the OpenAI API key has no credits and Cheaper Inference serves no embedding models, so vector search is deep mode only: `/memory deep`, back with `/memory fast`.
- Bug found and fixed: the vector lane's results carry the section id in `properties.source_key`; query.py looked only at the top level, so every vector result was dropped and the 6 s lane contributed nothing.
- Everything starts on input: the intent check, the search lanes and the router's Jev call begin as soon as the message arrives, so memory and routing overlap. The rerank starts as soon as the lanes are in, beside the intent check.
- Short follow-ups ("yes", "ok do it", "go ahead", "thanks") reuse the last route; no Jev call.
- Questions now read the vault (only steers, corrections and approvals skip memory).
- Noise left out of memory: reference lists and bibliographies, timestamped and pre-edit draft copies.
- Memory and the router default to the repo's bin/jev (TypeSafe, then classifier.dev) when JEV_BIN is not set.
- Measured after, same three messages: fast mode 2.2 to 2.9 s (was 11 to 13 s); deep mode 8.8 s with 2 to 3 sections.
- At merge: set defaultThinkingLevel to "high" in ~/.laurelin/agent/settings.json (Joe agreed 2026-10-05); "max" stays available per session.
- Tests: memory 17/17, router all pass (20/20 routed), launcher passes. Polygres graph hops return nothing (not fixed here).
