---
"@confect/cli": patch
---

Bundle workspace dependencies whose `exports` declare only the `import` condition

`confect codegen` and `confect dev` now bundle first-party workspace dependencies that are ESM-only — those whose `package.json` `exports` map declares the `import` condition but no `require`/`default`. Previously such a dependency was silently left external and then failed to load, breaking codegen and dev for any project that imported it.

When a workspace dependency genuinely can't be resolved, you now get a clear build warning naming the dependency instead of an opaque failure later on.
