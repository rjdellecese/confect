---
description: Weekly dependency maintenance — sweep open dep PRs, apply security fixes, then patch/minor upgrades
---

Run the weekly dependency maintenance pass. First read the
`maintaining-dependencies` skill and follow its invariants, verification
ladder, and changeset policy throughout. Do not merge anything.

1. **Sweep open dependency PRs.** For each open PR on a `claude/deps/*` branch:
   rebase onto `main` if it's behind or conflicted; if CI is red, diagnose and
   push a fix; if it's been superseded by `main` or a newer PR, close it with a
   comment saying why. Finish the sweep before opening new work.
2. **Security first.** Run `pnpm audit`. Fix each actionable advisory in its
   own PR, exempt from the cooling period, before anything else.
3. **Survey.** Run `pnpm -r outdated`. Take only patch and minor updates that
   clear the cooling period — majors are out of scope here (note any that look
   significant for the monthly pass).
4. **Group by judgment.** Keep interlocked dependencies together as the skill
   describes; beyond that, decide the grouping. A sensible default is one PR
   per interlocked set that has updates plus one batch PR for the
   low-risk remainder — and isolating anything you judge risky (large
   changelog, a `0.x` minor, or something that affects build output) so it
   can't block the rest.
5. **Apply, verify, changeset, and open PRs** per the skill.
6. If nothing is actionable this week, do nothing — no empty PRs, no noise.
