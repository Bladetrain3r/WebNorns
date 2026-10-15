# Weekly improvement routine (spec, not yet active)

*To be switched on only after a STOP: the project is declared ready for maintenance and improvement with minimal attendance.*

Each weekly run starts fresh: it reads the current state of the repo and open issues, and produces two verifiable outcomes.

1. **One fix.** If no issues or tickets are open, find one bug or point of failure that can be fixed with minimal impact on legibility or modularity. Reproduce it (a failing check or written repro steps), fix it, show the check passing. If issues are open, take the most tractable one instead.
2. **Three ideas.** One backend/logic (e.g. a genetic algorithm that favours interesting and resilient genotypes), one aesthetic (e.g. a new cosmetic or weather variant), one mechanical (a new interaction with its own visuals, rules and effects, or an extension such as a new kind of ball). Written up as issues or a short note in the pull request, not built unless trivial.

Constraints: the design rule (touch knobs, never pin values), files under ~500 lines, vanilla/zero install, no new dependencies. Output: one pull request with the fix and the idea write-up, for Ziggy to merge or not.
