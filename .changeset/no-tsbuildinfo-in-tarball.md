---
"@confect/core": patch
"@confect/js": patch
"@confect/react": patch
"@confect/server": patch
"@confect/test": patch
---

Stop publishing `dist/tsconfig.src.tsbuildinfo`. TypeScript's incremental build cache was being written into `dist` and swept into the tarball by `files: ["dist"]`; it now lives outside the published output. No runtime or type declarations changed.
