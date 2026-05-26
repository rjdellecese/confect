---
"@confect/cli": patch
---

Switch the codegen bundler to [`bundle-require`](https://github.com/egoist/bundle-require).

### Why

`9.0.0-next.4`'s `absoluteExternalsPlugin` externalized every bare-specifier import and rewrote it to a `file://` URL because the bundle was loaded via a parent-less `data:` URL. esbuild's resolver honors `tsconfig.json#compilerOptions.paths`, so a `~/src/foo`-style alias resolved to a local `.ts` file and got externalized as `file:///…/foo.ts` — which Node ESM cannot import (`ERR_UNKNOWN_FILE_EXTENSION`). The codegen bundler hand-rolled a third reimplementation of "load a TypeScript config file at runtime"; each iteration introduced a new bug.

### What changed

- `@confect/cli/Bundler` now delegates to `bundle-require`, the library `tsup`, `unbuild`, `vite`, `vitest`, and `vuepress` use for this exact problem. `bundle-require` writes a temp `.mjs` next to the source, `import()`s it, and deletes it — so bare-specifier externals (third-party packages, workspace deps) resolve through Node's normal `node_modules` walk and tsconfig `paths` aliases stay inside the bundle.
- `@confect/cli/confect/dev`'s watcher swaps `absoluteExternalsPlugin` for `bundle-require`'s `externalPlugin`, fed the project's `tsconfig.json#paths` via `loadTsConfig` so dev-mode rebuilds also bundle aliased local source instead of erroring on it.
- The `absoluteExternalsPlugin` export is removed from `@confect/cli/Bundler`.

### Fixes

- Restores `confect codegen` for any project that uses `tsconfig.json` `paths` aliases (e.g. `~/*`, `@/*`, `@app/*`) for its own source.
- As a side benefit, `__dirname`, `__filename`, and `import.meta.url` inside bundled impls now resolve to the original source path instead of the temporary bundle URL (`bundle-require`'s built-in injection).
