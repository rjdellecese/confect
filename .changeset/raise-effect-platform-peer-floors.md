---
"@confect/server": minor
---

Raise the `@effect/platform` peer dependency to `^0.97.0` and the `@effect/platform-node` peer dependency to `^0.108.0`.

Consumers must upgrade `@effect/platform` — and `@effect/platform-node`, which remains an optional peer needed only for the `@confect/server/node` entrypoint — in lockstep when bumping `@confect/server`. No source or behavior change accompanies the new floors; the `@effect/*` releases they admit only realign those packages' own dependency on `effect`.
