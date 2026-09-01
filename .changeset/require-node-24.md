---
"@confect/cli": major
"@confect/core": major
"@confect/foldkit": major
"@confect/js": major
"@confect/react": major
"@confect/server": major
"@confect/test": major
---

Raise the minimum supported Node.js version to 24.

### Breaking Changes

- `engines.node` is now `>=24` on every `@confect/*` package, raised from `>=22`.

Node 22 has entered maintenance, so Confect now targets Node 24, the active LTS line. To migrate, move the Node version your project builds and runs on to 24 or later — on Node 22, installing `@confect/*` now fails your package manager's engine check. No API changes accompany the raise: code already running on Node 24 needs no edits.
