---
"@confect/core": patch
"@confect/js": patch
"@confect/react": patch
"@confect/server": patch
"@confect/test": patch
"@confect/cli": patch
---

The published type declarations are now emitted by TypeScript 7 rather than TypeScript 6. No API changed, but the declaration text differs in places, so an inferred type printed in your editor or in a type error may read slightly differently than before.
