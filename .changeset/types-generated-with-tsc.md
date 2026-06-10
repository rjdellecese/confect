---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/test": patch
---

Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).
