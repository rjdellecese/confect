---
"@confect/cli": patch
---

Bundle workspace dependencies whose `exports` declare only the `import` condition

`bundleWorkspacePlugin` decided whether a first-party workspace dependency could
be bundled using CommonJS resolution (`createRequire().resolve()`). For an
ESM-only package whose `package.json` `exports` map declares only `import` (no
`require`/`default`), that call throws `ERR_PACKAGE_PATH_NOT_EXPORTED`; the throw
was swallowed and the dependency was silently externalized, so `confect codegen`
and `confect dev` failed loading it under raw Node ESM (`ERR_MODULE_NOT_FOUND`
against the dependency's internal imports).

Resolution now honors ESM `import` export conditions (via `exsolve`, falling back
to CommonJS resolution for `require`-only packages), so any package valid for ESM
consumers is bundled without the consumer adding a `require`/`default` condition.
A workspace dependency that genuinely can't be resolved now produces a clear
build warning instead of an opaque downstream runtime error.
