# @confect/cli

## 9.0.0-next.2

### Patch Changes

- bf13919: Generate a unique import binding per spec leaf in `_generated/spec.ts`, even when sibling `*.spec.ts` files share a basename across directories.

  Previously, codegen keyed import bindings by file basename (the filename minus `.spec.ts`). When two leaves shared a basename they collapsed to a single binding, last write wins. Every `addGroupAt(...)` site that should have referenced any of the colliding leaves ended up referencing the same survivor, and every impl whose sibling spec was dropped failed `validateImpl` with `Could not resolve group path for the provided GroupSpec.` because the assembled tree no longer contained that spec object's identity.

  Each binding now carries its own `localName` derived from the leaf's full path segments (e.g. `scripts_operational_seed_mutations`), used both as the imported identifier and at the matching `addGroupAt` site. Top-level leaves with single-segment paths are unchanged (`env`, `notes`, etc.).
  - @confect/core@9.0.0-next.2
  - @confect/server@9.0.0-next.2

## 9.0.0-next.1

### Patch Changes

- 7cb20ab: Allow a `confect/{path}.spec.ts` file to declare functions even when a sibling `confect/{path}/` subdirectory contains further specs.

  Previously, every function on the parent spec silently disappeared from the generated api and refs in this layout: `refs.{path}.{fn}` was not defined, while `refs.{path}.{child}.{fn}` (from the subdirectory specs) worked. The parent's `*.impl.ts` continued to type-check on its own, so the missing functions only showed up when something tried to call them.

  Both `confect codegen` and `confect dev` now generate the parent's functions and the subdirectory's groups side by side, as `refs.{path}.{fn}` and `refs.{path}.{child}.{fn}`.

  Codegen also now reports a clear error when the parent spec declares a function or subgroup whose name matches one of the subdirectory's child segments, rather than letting the conflict turn into a runtime refs collision. `confect codegen` exits non-zero on this error; `confect dev` logs it and keeps watching so the next save can recover.
  - @confect/core@9.0.0-next.1
  - @confect/server@9.0.0-next.1

## 9.0.0-next.0

### Major Changes

- 6db3a3a: Derive Confect function paths from the filesystem layout of `confect/`. Each group lives in a colocated `*.spec.ts`/`*.impl.ts` pair, and the group's name is its path within `confect/` (file stem for top-level groups, dot-joined directory path for nested groups). See [Project Structure](https://confect.dev/concepts/project-structure), [File Naming Conventions](https://confect.dev/concepts/file-naming-conventions), and [The Spec/Impl Model](https://confect.dev/concepts/spec-impl-model) for the current model.

  Each `*.spec.ts` default-exports its `GroupSpec`. Each `*.impl.ts` default-imports its sibling spec, builds its `GroupImpl`, and default-exports the result of `GroupImpl.finalize`. Named co-exports on `*.spec.ts` (such as error classes) remain allowed.

  ### Why

  The previous model assembled every group's impl into a single root `confect/impl.ts` (plus `confect/nodeImpl.ts`), which `confect codegen` emitted as the aggregate `_generated/registeredFunctions.ts`. Every generated `convex/` module — one per Convex function — imported from that aggregate, so loading any single query, mutation, or action transitively loaded the impl module of every other Convex function in the project, along with all of their dependencies. For large projects this inflated each function's bundle and added meaningful cold-start cost on Convex.

  Splitting impl across colocated `*.impl.ts` files is the vehicle for fixing that. With this change, `confect codegen` emits one `_generated/registeredFunctions/{path}.ts` per group, and each generated `convex/` module imports only its own group's per-group registry — which in turn imports only its own sibling `.impl.ts`. A Convex function's cold-start bundle now scales with its own group's impl rather than with the size of the whole project.

  ### Breaking changes
  - `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name argument; the group name is derived from the spec file's path within `confect/`.
  - `FunctionImpl.make(api, groupSpec, fn, handler)` and `GroupImpl.make(api, groupSpec)` now take the imported sibling spec object as their second argument instead of a dot-path string.
  - Every `GroupImpl` pipeline must end with `GroupImpl.finalize`, which only typechecks once every function declared by the spec has a corresponding `FunctionImpl` provided to the group layer. `GroupImpl.finalize` snapshots the names of every registered function onto the produced `Finalized` `GroupImpl` service value, and `confect codegen` reads those names to verify per-function coverage against the spec at runtime.
  - The previously-exported `Impl.make` and `Impl.finalize` (used by the old root `impl.ts`/`nodeImpl.ts` files) are removed. Per-group completeness is now enforced by `GroupImpl.finalize`.
  - Root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, `confect/nodeImpl.ts`, and any parent aggregator `*.spec.ts`/`*.impl.ts` files are no longer used. `confect codegen` deletes any of these on upgrade, along with the stale `_generated/registeredFunctions.ts` and `_generated/nodeRegisteredFunctions.ts`.
  - Every module under `convex/` is re-emitted to import from `_generated/registeredFunctions/{path}` instead of the previous aggregate file. Users who commit `convex/` to source control should expect a full rewrite of that directory on first codegen.

  ### Migration
  1. For each existing group, create a colocated `confect/{path}.spec.ts` and `confect/{path}.impl.ts` pair (under a subdirectory for nested groups).
     - In each spec, call `GroupSpec.make()` (or `GroupSpec.makeNode()`) without a name and `export default` the result.
     - In each impl, default-import the sibling spec (e.g. `import notes from "./notes.spec"`), pass it to `FunctionImpl.make`/`GroupImpl.make` in place of the previous dot-path string, append `GroupImpl.finalize` to the pipeline, and `export default` the resulting `GroupImpl` layer:
       ```ts
       export default GroupImpl.make(api, notes).pipe(
         Layer.provide(list),
         Layer.provide(insert),
         GroupImpl.finalize,
       );
       ```
  2. Delete root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, `confect/nodeImpl.ts`, and any parent aggregator spec/impl files. (`confect codegen` will also delete any of these it finds, plus the stale `_generated/registeredFunctions.ts` and `_generated/nodeRegisteredFunctions.ts`, so this step can be skipped.)
  3. Run `confect codegen`. Every module under `convex/` will be re-emitted.

### Patch Changes

- Updated dependencies [6db3a3a]
  - @confect/core@9.0.0-next.0
  - @confect/server@9.0.0-next.0

## 8.0.0

### Minor Changes

- 4bb2722: Bump Effect ecosystem to latest. `@effect/platform` is now `^0.96.1` and `@effect/platform-node` is now `^0.106.0` in `@confect/server`'s peer dependencies; `effect` peer is now `^3.21.2` across packages. Consumers must upgrade `@effect/platform`, `@effect/platform-node`, and `effect` in lockstep when bumping `@confect/server`.
- 40c1cff: Switch sibling `@confect/*` peer-dependency specifiers from `workspace:*` to `workspace:^`. Published peer ranges are now caret-based (e.g. `^7.0.0`) instead of exact-pinned, so non-major upgrades of one `@confect/*` package no longer fall out of range for its peer dependents.

  Paired with the Changesets `onlyUpdatePeerDependentsWhenOutOfRange` flag, this prevents the entire `@confect/*` family from being promoted to a major bump on every release when only minor/patch changes are present.

  `@confect/cli` additionally moves `@effect/platform` from `peerDependencies` to `dependencies`, since the CLI consumes it as an internal implementation detail (for `FileSystem`/`Path`) rather than exposing it in its public API. Consumers no longer need to install `@effect/platform` themselves to use the CLI.

### Patch Changes

- f308edd: Fix `confect codegen` and `confect dev` failing with "Cannot find package '@confect/core'"/"'@confect/server'" when the user's spec or impl files are bundled. The internal esbuild plugin used `import.meta.resolve(specifier, parent)` to resolve external imports, but Node silently ignores the second argument, so resolution always walked up from the CLI's own bundled file instead of from the user's project. Switched to `createRequire` keyed on the importing file's directory so external packages resolve out of the user's `node_modules`.
- Updated dependencies [4bb2722]
- Updated dependencies [40c1cff]
  - @confect/core@8.0.0

## 7.0.0

### Patch Changes

- Updated dependencies [90094d0]
  - @confect/core@7.0.0
  - @confect/server@7.0.0

## 6.0.0

### Patch Changes

- Updated dependencies [df95ce7]
- Updated dependencies [a8083e8]
- Updated dependencies [228589b]
  - @confect/core@6.0.0
  - @confect/server@6.0.0

## 5.0.0

### Patch Changes

- Updated dependencies [8853cbf]
  - @confect/server@5.0.0
  - @confect/core@5.0.0

## 4.0.0

### Major Changes

- 60be7e6: Add Effect-native cron job support via new `CronJob` and `CronJobs` modules.

  Cron jobs are now defined using Effect's `Cron` (cron expressions) or `Duration` (fixed intervals) types instead of the vanilla Convex `cronJobs()` API. `CronJob.make` creates individual jobs with a unique identifier, schedule, and ref to an internal mutation or action. `CronJobs.make()` creates an empty collection with a chainable `.add()` method.

  Interval schedules are represented in the largest whole unit possible (hours > minutes > seconds) to avoid floating-point precision issues with large durations.

- 8ae4d51: Standardize all Effect service tags to a consistent `@confect/{package}/{ServiceName}` format.

  The `Storage` namespace export has been removed from `@confect/server`. `StorageReader`, `StorageWriter`, `StorageActionWriter`, and `BlobNotFoundError` are now exported as individual top-level namespaces. Replace `Storage.StorageReader` with `StorageReader.StorageReader`, etc. After upgrading, rerun `confect codegen` to regenerate the `services.ts` file.

### Patch Changes

- Updated dependencies [60be7e6]
- Updated dependencies [641fd99]
- Updated dependencies [8ae4d51]
  - @confect/server@4.0.0
  - @confect/core@4.0.0

## 3.0.0

### Minor Changes

- 5fb6a61: Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.

### Patch Changes

- Updated dependencies [5fb6a61]
  - @confect/core@3.0.0
  - @confect/server@3.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [69ce9c9]
- Updated dependencies [f78c58a]
  - @confect/server@2.0.0
  - @confect/core@2.0.0

## 1.0.3

### Patch Changes

- 12b465a: Confect no longer maintains an `app.ts` which maps to `convex.config.ts`. If you'd like to use Convex components, define a `convex.config.ts` file in your `convex/` folder directly.
  - @confect/server@1.0.3
  - @confect/core@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [c4f9d67]
  - @confect/server@1.0.2
  - @confect/core@1.0.2

## 1.0.1

### Patch Changes

- d3ecdc7: Fix codegen failure in projects without `"type": "module"` in their `package.json`. Also dramatically improve codegen performance.
- Updated dependencies [00b12a0]
  - @confect/core@1.0.1
  - @confect/server@1.0.1

## 1.0.0

### Major Changes

- 2ff70a7: Initial release.

## 1.0.0-next.4

### Patch Changes

- 46109fb: Support Node actions
- Updated dependencies [46109fb]
  - @confect/server@1.0.0-next.4
  - @confect/core@1.0.0-next.4

## 1.0.0-next.3

### Patch Changes

- 9cd3cda: `confect/_generated/refs.ts` now default exports the `Refs` object, which now contains `public` and `internal` fields for each corresponding collection of Confect functions
- 186c130: `FunctionSpec.query` becomes `FunctionSpec.publicQuery`, same for mutations and actions
- Updated dependencies [9cd3cda]
- Updated dependencies [186c130]
  - @confect/server@1.0.0-next.3
  - @confect/core@1.0.0-next.3

## 1.0.0-next.2

### Patch Changes

- 071b6ed: Upgrade deps
- Updated dependencies [071b6ed]
- Updated dependencies [afc9fb4]
  - @confect/server@1.0.0-next.2
  - @confect/core@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [5a4127f]
  - @confect/core@1.0.0-next.1
  - @confect/server@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 2ff70a7: Initial release.

### Patch Changes

- Updated dependencies [2ff70a7]
  - @confect/server@1.0.0-next.0
