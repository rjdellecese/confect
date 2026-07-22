# @confect/server

## 10.0.0-next.4

### Patch Changes

- b27f12d: Fix query and mutation handlers crashing with Convex's "Can't use setTimeout in queries and mutations" error once they performed enough Effect operations to trigger a cooperative fiber yield. Effect execution in queries and mutations now yields via the microtask queue instead of timer APIs, which Convex's isolate forbids. Actions are unchanged.

## 10.0.0-next.3

### Patch Changes

- 5b63546: Raise the required `effect` peer version to `^4.0.0-beta.100` (from `^4.0.0-beta.99`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.100` release only touches `Cron` internals (month/weekday alias normalization, day/weekday rollover, and equality/hashing), CLI error message formatting (`InvalidValue` prefixes), and `Schema.toTaggedUnion` discriminants that Confect doesn't use.

## 10.0.0-next.2

### Patch Changes

- 35f7515: Raise the required `effect` peer version to `^4.0.0-beta.99` (from `^4.0.0-beta.98`).

  This is a peer-range-only change with no consumer-visible API consequences. The `beta.99` release only touches `Graph`, CLI (`Command`/`CliConfig`/wizard mode), `Tool` cloning, Redis script eval, and multipart parser internals that Confect doesn't use.

- 2aa7541: Sync with `main`: this prerelease line now includes all changes released in `@confect/*` 9.2.2–9.2.4 — see those versions' changelog entries.

## 10.0.0-next.1

### Patch Changes

- 4d98ea8: Raise the required `effect` peer version to `^4.0.0-beta.98` (from `^4.0.0-beta.97`).

  `effect`'s `SchemaError` is now exposed as its own public module (`effect/SchemaError`), which changes the import path TypeScript picks when Confect emits `.d.ts` declarations that reference `Schema.SchemaError` (for example in generated `services.d.ts`). Existing `Schema.SchemaError` / `Schema.isSchemaError` usage is unaffected — this is purely a declaration-emit detail that consumers relying on generated types may notice.

- Updated dependencies [4d98ea8]
  - @confect/core@10.0.0-next.1

## 10.0.0-next.0

### Major Changes

- 70e313e: Migrate to Effect v4. All `@confect/*` packages now require `effect@^4.0.0-beta.97`; `@effect/platform` and `@effect/cli` are no longer dependencies (their functionality moved into `effect` core and `effect/unstable/*`).

  Breaking changes for users:
  - **Schemas** follow Effect v4's Schema API: `Schema.Union([a, b])` (array form), `Schema.Literals([...])` for literal unions, `Schema.optionalKey` in place of `optionalWith({ exact: true })`, `Schema.TaggedErrorClass` in place of `Schema.TaggedError`, and checks like `Schema.String.check(Schema.isMaxLength(...))` in place of piped filters.
  - **Option-returning functions** must use a codec with a serializable encoded form, such as `Schema.OptionFromNullOr(...)` — v4's `Schema.Option` encodes to an `Option` instance, which is not a Convex value.
  - **Table schemas** may now be transformations (`Schema.decodeTo` chains, `Schema.encodeKeys`), branded structs, suspended schemas, or unions of these — Convex's system fields are carried through the whole encoding chain. Schemas that do not resolve to an object shape at every step (such as `Schema.Class`) are rejected with a descriptive error when the table is defined.
  - **Clients**: decode failures surface as `SchemaError` rather than `ParseError` in `@confect/js` and `@confect/react`, and `@confect/react`'s `useMutation`/`useAction` handles with an `error` schema now resolve to `Result` (v4's replacement for `Either`).
  - **HTTP** is now mounted through the renamed `HttpRouter` module (formerly `HttpApi`). `HttpRouter.make(routes)` takes a single route-registering `Layer` composed from Effect's own `effect/unstable/http` and `effect/unstable/httpapi` modules — `HttpApiBuilder.layer(api)` (with group handler layers supplied via `Layer.provide`; a missing group is a compile-time error), `HttpApiScalar.layer` for docs, `HttpRouter.add` for plain routes, and `HttpRouter.middleware(fn, { global: true })` for middleware, merged with `Layer.mergeAll`. The per-path-prefix record and its `api`/`apiLive`/`middleware`/`scalar` options are gone; Confect registers one catch-all Convex HTTP action at `/`, and plain Convex routes added to the returned router still take precedence. Handlers, middleware, and route-layer construction all run with Confect's Convex-aware `ConfigProvider` in context.
  - **Node actions** use `effect/unstable/process` (`ChildProcessSpawner`) and `@effect/platform-node`'s `NodeServices` in place of `@effect/platform` `Command`/`NodeContext`.
  - **Configuration**: Confect's Convex-aware `ConfigProvider` treats empty-string environment variables as missing values (matching Effect v4's built-in providers), so `Config.withDefault` and `Config.option` recover from them.
  - **CLI**: a malformed `convex.json` now fails codegen with a descriptive error instead of being silently ignored.
  - Confect queries no longer stub the global `Date.now`. Queries run with a `Clock` whose unsafe accessors return constants, so Effect-internal reads (log timestamps, spans) never evict a query from Convex's cache; explicit time reads — `Clock.currentTimeMillis`/`currentTimeNanos` or a raw `Date.now()` call — opt the query out and evict as they honestly should.

### Patch Changes

- Updated dependencies [70e313e]
  - @confect/core@10.0.0-next.0

## 9.2.4

### Patch Changes

- 5107fa1: Fix a TypeScript 6 type mismatch for schemas with nested optional fields.

  When compiled with TypeScript 6, the document types Confect derives for schemas containing nested optional fields (e.g. `{ foo: { bar?: number | undefined } }`) picked up a stray `| undefined` on those fields, so they no longer lined up with the types Convex infers for the equivalent validators. This could surface as type errors wherever a Confect-derived validator or document type meets a Convex one. The derived types are now identical under TypeScript 5.x and 6.x.

## 9.2.3

### Patch Changes

- @confect/core@9.2.3

## 9.2.2

### Patch Changes

- 7e7b2a4: Throw an error when a cron schedule specifies a non-UTC timezone

  Convex evaluates all cron expressions in UTC, so specifying a timezone has no effect. Previously, a non-UTC timezone was silently ignored, which could produce a job that ran at the wrong time.

  To prevent this silent misbehavior, a cron that specifies a non-UTC timezone now throws an error.
  - @confect/core@9.2.2

## 9.2.1

### Patch Changes

- @confect/core@9.2.1

## 9.2.0

### Patch Changes

- @confect/core@9.2.0

## 9.1.5

### Patch Changes

- @confect/core@9.1.5

## 9.1.4

### Patch Changes

- @confect/core@9.1.4

## 9.1.3

### Patch Changes

- Updated dependencies [8d63382]
  - @confect/core@9.1.3

## 9.1.2

### Patch Changes

- e2bb5ef: Fix `db.patch`, `db.replace`, and `db.insert` rejecting branch-specific fields on tables whose schema is a `Schema.Union`.

  Writing a field that only exists on one member of the union (e.g. patching `status` on the `Dropship` branch of a union-typed `orders` table) failed to typecheck — only the fields common to every member were accepted. These operations now accept every branch's fields. This also unblocks consuming a Confect backend as a referenced/composite TypeScript project, which previously failed to emit declarations because of these errors.
  - @confect/core@9.1.2

## 9.1.1

### Patch Changes

- 308b347: Fix codegen emitting an invalid `interface … extends Document.Document<…>` in `_generated/docs.ts` for tables whose document type is not a single object.

  `Document.Document<Schema, Table>` is a type alias that resolves to whatever the table's schema is, so for a `Schema.Union` table (or any non-object document: branded primitives, `Schema.transform` results, …) it resolves to a union. An `interface` cannot extend a union, so the generated `XDoc` tripped `TS2312` and collapsed to an unusable type, which then broke every reader/writer helper that printed it.

  Codegen now emits a `type` alias per table — `export type NotesDoc = Document.Document<typeof schemaDefinition, "notes">;` — which keeps the named document type (so declaration emit still prints `NotesDoc` rather than the expanded row) while supporting every document shape. Runtime behaviour is unchanged.
  - @confect/core@9.1.1

## 9.1.0

### Minor Changes

- 8bbde87: Make Confect's public types declaration-emittable, fixing `TS7056` under `tsc --build` with `composite`/`declaration` (e.g. consuming a Confect backend as a referenced TypeScript project).

  The schema-generic service tags (`DatabaseReader`, `DatabaseWriter`, `VectorSearch`, `QueryCtx`/`MutationCtx`/`ActionCtx`) now back their `Context.GenericTag` with named generic interfaces, and codegen annotates the `_generated/services.ts` exports with the corresponding tag aliases — so declaration emit prints the names by reference instead of re-expanding the whole data model (the example backend's `services.d.ts` drops from ~307 KB to ~5.6 KB).

  Codegen also emits `_generated/docs.ts` — a nominal `interface` per table plus a `Docs` registry — threaded into the reader/writer tags via the `Document.Document<Schema, Table>` helper, so query/mutation helpers print named document types (e.g. `NotesDoc`) with no added annotations. Runtime behaviour is unchanged.

### Patch Changes

- Updated dependencies [4d8a568]
  - @confect/core@9.1.0

## 9.0.2

### Patch Changes

- dd33006: Fix a crash when `get` by index missed on an index over non-string fields.

  `GetByIndexFailure` declared its `indexFieldValues` as `Schema.Array(Schema.String)` while the actual values can be any Convex value (numbers, bigints, booleans, ids, etc.). Because `Schema.TaggedError` constructors validate at runtime, a `get` by such an index would die with a `ParseError` defect whenever the lookup found no document — instead of failing with the catchable `GetByIndexFailure`. Lookups that found a document were unaffected, so the crash only surfaced on a miss.

  `indexFieldValues` is now typed as an array of unknown values and carries the actual values used in the failed lookup. The error `message` renders them as JSON, handling every Convex value type including `bigint` values from `int64` index fields.
  - @confect/core@9.0.2

## 9.0.1

### Patch Changes

- 445ea9b: Loosen and align dependency ranges across all packages:
  - The `convex` peer dependency is now `^1.32.0` in every package (previously pinned exactly to `1.39.1`, or `^1.30.0` in `@confect/react`). The range is validated against convex 1.32.0 through 1.40.0.
  - `@confect/server`'s `@effect/platform-node` peer dependency is now optional — it is only needed when using the `@confect/server/node` entrypoint.
  - `@confect/cli` now uses caret ranges for its `@effect/platform` and `@effect/platform-node` dependencies so they can deduplicate with the versions resolved for `@confect/server`, and no longer declares an unused direct dependency on `@effect/platform-node-shared`.
  - `@confect/test` now accepts any `convex-test` release in `>=0.0.50 <0.1.0` instead of exactly 0.0.50.

- Updated dependencies [445ea9b]
  - @confect/core@9.0.1

## 9.0.0

### Major Changes

- a905072: Rearchitect Confect so that cold-starting a Convex function only evaluates its own group's module graph, cutting cold-start execution time on large projects. The change touches how you author tables, specs, and impls, and removes the project-wide aggregation that used to make every function evaluate every other function's code—and every table's schema—the first time it ran.

  Convex bundles a deployment into a single artifact, but a function's cold start only _evaluates_ the module graph reachable from its own entry point. Previously, all impls were assembled into a single root `confect/impl.ts` that every generated `convex/` module imported, so cold-starting any one query, mutation, or action transitively evaluated the impl of every other function in the project, plus every function spec and every table schema, at module-load time. Cold-start execution time scaled with the size of the whole project. In v9, `confect codegen` emits one registry per group and each generated `convex/` module imports only its own group—so a function's cold-start work scales with its own group, not the project.

  ### Filesystem-driven groups

  Your API is now authored as colocated `*.spec.ts`/`*.impl.ts` pairs, one pair per group, and **the file's path within `confect/` is the group's name** (its stem for top-level groups, the dot-joined directory path for nested groups). `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name argument.
  - Each `*.spec.ts` `export default`s its `GroupSpec` (named co-exports like error classes are still allowed).
  - Each `*.impl.ts` default-imports its sibling spec, passes it to `FunctionImpl.make` / `GroupImpl.make`, and ends the layer pipeline with `GroupImpl.finalize`—a compile-time completeness check that only typechecks once every function the spec declares has a `FunctionImpl` provided.
  - The root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, and `confect/nodeImpl.ts` files are gone, along with `Impl.make` and `Impl.finalize`. `confect codegen` deletes any of these (and the stale aggregate `_generated/registeredFunctions.ts` / `_generated/nodeRegisteredFunctions.ts`) on upgrade.

  ### Tables are the source of truth, named by their filename

  Your schema now lives entirely in `confect/tables/`, one `Table` per file, and **the filename is the table name**—`confect/tables/notes.ts` defines the `notes` table. `Table.make` no longer takes a name argument. The user-authored `confect/schema.ts` is removed; codegen scans `confect/tables/*.ts` and generates everything else.

  Each table file is a default-export-only module, and its field schema is wrapped in a `() =>` callback so it is built lazily—a function only pays a table's schema-construction cost at cold start for tables it actually reads.

  ```ts confect/tables/notes.ts
  import { Table } from "@confect/server";
  import { Schema } from "effect";
  import { Id } from "../_generated/id";

  export default Table.make(() =>
    Schema.Struct({
      userId: Schema.optional(Id("users")),
      text: Schema.String,
    }),
  );
  ```

  Codegen emits, alongside it:
  - `_generated/schema.ts`—the runtime `DatabaseSchema`. Never imports `convex/server`, so a runtime cold start no longer evaluates `defineSchema(...)`.
  - `_generated/convexSchema.ts`—the Convex deploy `SchemaDefinition`, re-exported from `convex/schema.ts`.
  - `_generated/id.ts`—a type-safe `Id` constructor whose argument is constrained to your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`; cross-table `_id` typos are now caught at compile time.
  - `_generated/tables/<name>.ts`—a thin wrapper that binds the filename to the table. Read a table's `Doc`, `Fields`, and `tableName` from this wrapper (`import notes from "../_generated/tables/notes"`), not from `confect/tables/`.

  A bound table's `name` property is renamed to `tableName` (avoiding a collision with `Function.prototype.name`).

  ### Specs and impls: lazy schemas, and impls take the `DatabaseSchema`

  `FunctionSpec.*` constructors now take `args`, `returns`, and the optional `error` as `() => Schema` thunks, so importing a spec builds no schemas until a function is invoked. `FunctionImpl.make` and `GroupImpl.make` take the runtime `DatabaseSchema` (the default export of `_generated/schema`) as their first argument instead of the whole `Api`—which keeps the project-wide spec graph out of a function's cold-start module graph. The `Api` module (`Api.make`, the `Api` type) and the generated `_generated/api.ts` / `_generated/nodeApi.ts` files are removed.

  **Before:**

  ```ts confect/notes.spec.ts
  export const notes = GroupSpec.make("notes").addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Notes.Doc),
    }),
  );
  ```

  ```ts confect/notes.impl.ts
  const list = FunctionImpl.make(api, "notes", "list", handler);
  export const notes = GroupImpl.make(api, "notes").pipe(Layer.provide(list));
  ```

  **After:**

  ```ts confect/notes.spec.ts
  import notes from "./_generated/tables/notes";

  export default GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => Schema.Struct({}),
      returns: () => Schema.Array(notes.Doc),
    }),
  );
  ```

  ```ts confect/notes.impl.ts
  import databaseSchema from "./_generated/schema";
  import notes from "./notes.spec";

  const list = FunctionImpl.make(databaseSchema, notes, "list", handler);
  export default GroupImpl.make(databaseSchema, notes).pipe(
    Layer.provide(list),
    GroupImpl.finalize,
  );
  ```

  ### Node functions are first-class

  A group's runtime is now declared solely by its spec—`GroupSpec.makeNode()` for a Node action group, `GroupSpec.make()` otherwise—mirroring vanilla Convex's per-file `"use node"` directive. The separate `node` namespace is gone: Node specs/impls are ordinary colocated pairs that can live anywhere in `confect/`, and codegen emits the `"use node"` directive based on the spec.
  - A Node group at `confect/email.spec.ts` is now reached at `refs.public.email.send` instead of `refs.public.node.email.send`.
  - `@confect/core` removes `Spec.makeNode`, `Spec.merge`, and `Spec.isConvexSpec` / `Spec.isNodeSpec`; `Spec.make()` is a single mixed-runtime container and `Refs.make(spec)` takes one argument. `GroupSpec.makeNode()`, `FunctionSpec.publicNodeAction()` / `internalNodeAction()` are unchanged.

  ### Less work at cold start

  Confect's own packages now import Effect from its submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel. A barrel import of a namespace re-export pulls the entire namespace into the module graph a function evaluates at cold start, even when only a small part is used; importing the submodule path evaluates only what's needed. On a minimal function this cut cold-start module-evaluation time by ~35%. This is an internal change with no effect on your code—but to get the full win, import Effect from its submodule paths in your own `confect/` files too, since a single barrel import anywhere in a function's module graph re-pins the whole namespace.

  ### Stable React hook results

  `@confect/react` hooks now hold stable identities across renders, matching Convex's own hooks. `useQuery` memoizes the decoded `QueryResult` by the (referentially stable) Convex result, so unchanged data keeps the same `QueryResult` instead of a fresh one each render—fixing effect/memo loops (including `Maximum update depth exceeded`) for code that derives off the result. `useMutation` and `useAction` return a stable `useCallback`, and `Ref.getFunctionReference` caches the Convex function reference per function name.

  ### Codegen robustness

  The codegen bundler now uses [`bundle-require`](https://github.com/egoist/bundle-require), so impls may import third-party packages and use `tsconfig.json` `paths` aliases (`~/*`, `@/*`, …) for their own source. A parent `confect/{path}.spec.ts` may now declare functions alongside a sibling `confect/{path}/` subdirectory of further specs, and codegen reports a clear error on a name collision between the two.

  ### Migration
  1. **Tables.** Delete `confect/schema.ts`. Rename each table file to a valid JS identifier (e.g. `confect/tables/notes.ts`); the basename becomes the table name. Drop the name argument from `Table.make`, wrap the field struct in `() =>`, and replace `GenericId.GenericId("x")` with `Id("x")` from `_generated/id`. If you read `table.name` off a bound table, rename it to `table.tableName`.
  2. **Specs.** Split each group into a colocated `*.spec.ts` that `export default`s `GroupSpec.make()` (no name). Wrap every `args`/`returns`/`error` in `() =>`. Import a table's `Doc`/`Fields` from its wrapper, `import notes from "./_generated/tables/notes"`.
  3. **Impls.** In each `*.impl.ts`, default-import the sibling spec, import `databaseSchema` from `_generated/schema`, pass it to `FunctionImpl.make` / `GroupImpl.make` in place of `api`, end the pipeline with `GroupImpl.finalize`, and `export default` it. Delete the root `confect/spec.ts`, `impl.ts`, `nodeSpec.ts`, and `nodeImpl.ts` (codegen will also remove them).
  4. **Node groups.** Move any `confect/node/<path>` files anywhere you like under `confect/`; the `node/` directory no longer has special meaning. Drop the `node` segment from call sites (`refs.public.node.<group>` → `refs.public.<group>`) and replace `Refs.make(spec, nodeSpec)` with `Refs.make(spec)`.
  5. **Tests.** If you use `@confect/test`, import `confectSchema` from `_generated/schema`, import the generated `convexSchema` from `_generated/convexSchema`, and pass `convexSchema` as the new second argument to `TestConfect.layer`.
  6. **Optional.** Adopt submodule Effect imports (`import * as Schema from "effect/Schema"`) in your own `confect/` files for the full cold-start savings.
  7. Run `confect codegen`. It re-emits the entire `convex/` tree and `confect/_generated/`, deleting any stale files from earlier versions.

### Patch Changes

- 9eec71c: Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

  The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).

- Updated dependencies [9eec71c]
- Updated dependencies [a905072]
  - @confect/core@9.0.0

## 9.0.0-next.10

### Patch Changes

- 9eec71c: Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

  The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).

- Updated dependencies [9eec71c]
  - @confect/core@9.0.0-next.10

## 9.0.0-next.9

### Major Changes

- 4894959: Make Node-runtime functions first-class and remove the separate `node` namespace.

  A function group's runtime is now declared solely by its spec — `GroupSpec.makeNode()` for a Node action group, `GroupSpec.make()` for a Convex group — exactly like vanilla Convex's per-file `"use node"` directive. The `confect/node/` directory is no longer special: Node specs/impls are ordinary colocated `.spec.ts`/`.impl.ts` pairs that can live anywhere in `confect/`, and codegen emits the `"use node"` directive into the generated `convex/` module based on the spec. This is safe because v9's per-group registries already isolate each Convex function's bundle from every other group's impl, so Node-only code can no longer leak into a Convex-runtime bundle regardless of namespace.

  ### Why

  The `node` namespace existed only because the pre-v9 architecture aggregated every function's impl into one module that all generated `convex/` modules imported; Node functions had to be quarantined into a separate spec/impl/registry tree so Convex-runtime functions wouldn't transitively import Node-only code. v9's per-group isolation removed that constraint, so the namespace was no longer load-bearing — only ergonomic overhead that diverged from vanilla Convex (which identifies Node modules per-file, with no directory requirement).

  ### Breaking changes
  - **API namespace removed.** A Node group at `confect/email.spec.ts` is now referenced as `refs.public.email.send` instead of `refs.public.node.email.send`. Node groups are ordinary groups in the refs tree, nesting preserved like any other group.
  - **Generated layout changed.** Node modules are emitted at `convex/<path>.ts` (carrying `"use node"`) instead of `convex/node/<path>.ts`, and their registries at `confect/_generated/registeredFunctions/<path>.ts`. The single assembled `confect/_generated/spec.ts` now contains every group regardless of runtime; `confect/_generated/nodeSpec.ts` is no longer generated (codegen deletes any stale copy on upgrade).
  - **`@confect/core` API.** Removed `Spec.makeNode`, `Spec.merge`, and `Spec.isConvexSpec`/`Spec.isNodeSpec`. `Spec` is now a single mixed-runtime container (`Spec.make()` accepts groups of any runtime). `Refs.make(spec)` takes a single argument (the unified spec) instead of `(convexSpec, nodeSpec)`. `GroupSpec.makeNode()`/`makeNodeAt()` and `FunctionSpec.publicNodeAction()`/`internalNodeAction()` are unchanged; `GroupSpec` subgroups may now be of any runtime (a group is just a namespace for its children).

  ### Migration
  1. Move any `confect/node/<path>.spec.ts`/`.impl.ts` files to wherever you want them under `confect/` (e.g. `confect/<path>.spec.ts`); the `node/` directory has no special meaning anymore. Their specs already use `GroupSpec.makeNode()`, so no spec-body change is needed — only fix the impl's relative import of `_generated/schema` if its depth changed.
  2. Update call sites to drop the `node` segment: `refs.public.node.<group>.<fn>` → `refs.public.<group>.<fn>`.
  3. Replace `Refs.make(spec, nodeSpec)` with `Refs.make(spec)` (codegen does this for `_generated/refs.ts` automatically).
  4. Run `confect codegen`. The `convex/` tree and `confect/_generated/` are re-emitted; the stale `_generated/nodeSpec.ts` is removed.

### Patch Changes

- Updated dependencies [4894959]
  - @confect/core@9.0.0-next.9

## 9.0.0-next.8

### Patch Changes

- 3fec285: Import Effect from its submodule paths internally to shrink per-function cold-start bundles.

  Confect's packages now import Effect modules from their submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel (`import { Schema } from "effect"`).

  ### Why

  A barrel import of a namespace re-export defeats esbuild's tree-shaking: accessing `Schema.X` from `import { Schema } from "effect"` retains the _entire_ `Schema` namespace, because the bundler can't prune property access on the barrel's `export * as Schema`. So every Convex function's cold-start bundle was pulling all of `effect/Schema` and `effect/Stream` — and, transitively through Schema's `Arbitrary`, `fast-check` — whether the function used them or not.

  Importing from the submodule path tree-shakes normally. On a minimal function this cut the bundle esbuild produces by ~54% (the `effect/Schema` module alone by ~75%) and its cold-start module-evaluation time by ~35%, with `fast-check` dropped entirely. This is also the import style Effect v4 recommends, so it's forward-compatible. A `no-restricted-imports` ESLint rule now enforces it across the codebase (type-only imports and `@effect/vitest` are exempt).

  No API changes — your existing code keeps working.

  ### Getting the full win in your own code

  This change shrinks the Confect code in every function bundle, but a function's bundle also includes your own `confect/tables/*` and `*.spec.ts` files. esbuild retains the union across all importers, so a single barrel import anywhere in a function's module graph re-pins the whole `effect/Schema` namespace and undoes the reduction. To get the full bundle/cold-start savings, import Effect from its submodule paths in your own Confect files too:

  ```diff
  - import { Schema } from "effect";
  + import * as Schema from "effect/Schema";
  ```

  Bare helpers (`pipe`, `flow`, `identity`) come from `"effect/Function"`.

- Updated dependencies [3fec285]
  - @confect/core@9.0.0-next.8

## 9.0.0-next.7

### Patch Changes

- Updated dependencies [5d19484]
  - @confect/core@9.0.0-next.7

## 9.0.0-next.6

### Major Changes

- 46045a9: Reduce per-function cold-start cost: make `FunctionSpec` schemas lazy and keep each Convex function's bundle scoped to its own group.

  Previously, loading a single Convex function still paid for the whole project — importing the codegen-assembled `_generated/spec.ts` ran `Schema.Struct(...)` / `Schema.Array(...)` for every function at module load, and each per-function bundle transitively imported `_generated/api.ts` → `_generated/spec.ts` (every spec). A function's cold-start cost now scales with its own group rather than the size of the project.

  ### Lazy `FunctionSpec` schemas

  `FunctionSpec.*` (`publicQuery` / `internalQuery` / `publicMutation` / `internalMutation` / `publicAction` / `internalAction` / `publicNodeAction` / `internalNodeAction`) takes `args`, `returns`, and (optional) `error` as `() => Schema` thunks instead of bare schemas. The resulting provenance exposes them as sync lazy memoised getters (the same pattern `Table.make` uses), so importing `_generated/spec.ts` builds no schemas — construction is deferred to the first invocation that compiles validators or runs a codec.

  Migration — wrap each schema in `() =>`:

  ```diff
    FunctionSpec.publicQuery({
      name: "list",
  -   args: Schema.Struct({}),
  -   returns: Schema.Array(notes.Doc),
  +   args: () => Schema.Struct({}),
  +   returns: () => Schema.Array(notes.Doc),
    })
  ```

  ### Impls take the `DatabaseSchema`, and group paths resolve impl-side

  `FunctionImpl.make` and `GroupImpl.make` now take the runtime `DatabaseSchema` (the default export of `_generated/schema.ts`) as their first argument instead of the whole `Api`. The handler's ctx-service types only ever depended on the database schema, and switching impls to import `_generated/schema` instead of `_generated/api` removes `_generated/spec.ts` (and the function specs it transitively imports) from every per-function bundle.

  Each function also registers under a flat, single-segment key into a fresh, isolated `Registry` provided per group by `RegisteredFunctions.buildForGroup` (and the CLI's impl validation), so no group-path lookup against `api.spec` is needed. As a result `Spec#addPath`, `Spec#paths`, and `Api.resolveGroupPathUnsafe` are removed; `GroupImpl` / `FunctionImpl` drop their group-path type parameter; and the codegen-emitted `_generated/spec.ts` / `nodeSpec.ts` no longer contain a `.addPath(...)` chain (the `.addAt(...)` / `.addGroupAt(...)` assembly tree that `Refs.make` consumes is unchanged).

  Migration — in each `*.impl.ts`, import the database schema and pass it where you passed `api` / `nodeApi`:

  ```diff
  - import api from "../_generated/api";        // (or nodeApi from "../_generated/nodeApi")
  + import databaseSchema from "../_generated/schema";

  - const insert = FunctionImpl.make(api, notes, "insert", handler);
  + const insert = FunctionImpl.make(databaseSchema, notes, "insert", handler);

  - export default GroupImpl.make(api, notes).pipe(Layer.provide(insert), GroupImpl.finalize);
  + export default GroupImpl.make(databaseSchema, notes).pipe(Layer.provide(insert), GroupImpl.finalize);
  ```

  Node impls migrate identically (from `nodeApi` to the same `_generated/schema`); only their specs differ (`GroupSpec.makeNode()`). Hand-rolled tests that built a `Spec` via `.addPath(group, "dot.path")` should drop those calls.

  ### `buildForGroup` and the generated registries

  `RegisteredFunctions.buildForGroup` takes the `DatabaseSchema` value plus the group's own `GroupSpec` as a single type argument (`buildForGroup<typeof groupSpec>(…)`, returning `RegisteredFunctionsForGroupSpec<Group>`); the `api` / `groupPath` parameters and the `ForGroupPath` dot-path navigation are gone. `RegisteredConvexFunction.make` / `RegisteredNodeFunction.make` take the `DatabaseSchema` rather than the `Api`. Each `_generated/registeredFunctions/{path}.ts` imports the runtime schema and references its group's leaf spec **type-only** (`typeof import("…/{group}.spec")["default"]`), so it never imports a spec module at runtime.

  ### `_generated/api.ts` / `nodeApi.ts` are no longer emitted, and `Api` is removed

  Nothing imports them anymore, so `confect codegen` no longer emits `_generated/api.ts` / `_generated/nodeApi.ts` and deletes any copies left over from earlier versions. The `Api` module itself (`@confect/server/Api` — `Api.make`, the `Api` type, `Api.resolveGroupPathUnsafe`, etc.) is **removed entirely**: impls and the generated registries take the `DatabaseSchema` value and the spec directly, so the combined database-schema-plus-spec `Api` is no longer used anywhere.

  ### Net effect

  A function's `convex/{path}.ts` bundle now imports only its own group's registry → its own `.impl` + `_generated/schema` (table schemas, built lazily) + its own group's spec. No `_generated/api.ts`, no project-wide `_generated/spec.ts`, and no sibling-group impls/specs. Re-run `confect codegen` after upgrading.

- 762f7eb: Split the deploy-time Convex schema from the runtime `DatabaseSchema`, make `confect/tables/` the single source of truth — including the table name, which is now derived from the filename — and make per-table schema construction lazy.

  Previously, `confect/schema.ts` was user-authored and `DatabaseSchema` carried a `convexSchemaDefinition` field that was eagerly rebuilt on every `.addTable(...)`. That field was an `O(n²)` allocation for `n` tables, and it forced both the deploy CLI (which only needs `defineSchema(...)`) and the runtime (which only needs the table codec lookup) through the same module — so any runtime function bundle dragged in `convex/server`'s `defineSchema`. Issue 1.

  Codegen now scans `confect/tables/*.ts` (every file must default-export a `Table`) and emits two siblings:
  - `confect/_generated/schema.ts` — the runtime `DatabaseSchema`, consumed by `_generated/api.ts`. Imports `@confect/server` but never `convex/server`.
  - `confect/_generated/convexSchema.ts` — the Convex deploy `SchemaDefinition`, re-exported one-line from `convex/schema.ts`. Imports `convex/server` but never `@confect/server`.

  The `convexSchemaDefinition` field is removed from `DatabaseSchema` and `Api`. `TestConfect.layer` now takes the Convex schema definition as a separate argument so it can stay aligned with the deploy artifact without bringing the runtime schema along for the ride.

  ### Filename-derived table names

  The table name is now derived from the file's basename — `confect/tables/notes.ts` defines a table called `notes`. `Table.make` no longer accepts a name argument and returns an _unnamed_ `Table` value; codegen invokes that value with the filename to produce the bound table.

  This eliminates a class of subtle infelicities: the file basename and the table name can never drift out of sync, cross-table `_id` references are type-constrained against the actual set of declared tables (catching typos at compile time), and ESM cycle hazards for mutual cross-table `Id` references are gone because authoring files no longer transitively import each other.

  Codegen now emits two new sets of files alongside `_generated/schema.ts` and `_generated/convexSchema.ts`:
  - `confect/_generated/id.ts` — a single `Id` constructor whose argument is type-constrained to the union of your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`.
  - `confect/_generated/tables/<name>.ts` — one thin wrapper per table that binds the unnamed value from `confect/tables/<name>.ts` to its filename. This is what other modules (specs, impls, HTTP handlers) default-import to reach a table's `Doc`, `Fields`, and `tableName`.

  Table filenames must be valid JS identifiers, may not start with `_` (Convex reserves underscore-prefixed names for system tables), and may not collide with reserved JS keywords like `import.ts`. Pick a casing convention you like — Confect's example code uses `snake_case` (`notes.ts`, `user_profiles.ts`).

  The bound `Table`'s `name` property has been renamed to `tableName`. This avoids a silent collision with the built-in `Function.prototype.name` that JavaScript carries on every function value (including the new unnamed-callable `UnnamedTable`).

  ### Lazy per-table schema construction

  `Table.make` takes a `() => Schema.Struct({...})` callback rather than a bare struct, and a bound `Table`'s `Fields`, `Doc`, and `tableDefinition` are lazy memoised getters that only invoke that callback on first access.

  Previously, every `confect/tables/<name>.ts` module ran `Schema.Struct({...})` (and the corresponding `compileTableSchema` / `defineTable` work) at module-load time. Because the codegen-emitted `_generated/schema.ts` is imported transitively from every per-group function bundle, loading any one function eagerly built _every_ table's schema graph — paying a cold-start cost proportional to the whole project, not just the function being invoked.

  The bound `Table` now exposes `Fields` / `Doc` / `tableDefinition` as lazy getters that compute their value on first access, then replace themselves with a plain non-writable data property so second-and-subsequent accesses are observably indistinguishable from a plain property (and skip all function-call overhead). The result: a function bundle only pays the schema-construction cost for tables it actually touches via `db.table(name)` (which reaches `Fields` through `Document.decode`). The `UnnamedTable` callable no longer exposes `Fields` or `tableDefinition` — read these off the bound `Table` (the generated `_generated/tables/<name>.ts` wrapper already binds the name).

  ### Migration
  1. Delete your `confect/schema.ts`. Codegen will refuse to run while a stray copy is present.
  2. Rename each `confect/tables/<Name>.ts` to a valid JS identifier in your chosen casing convention (e.g. `confect/tables/notes.ts`). The basename becomes the table name; you no longer pass it as an argument.
  3. Convert each table file to a **default-export-only** unnamed module: drop the name argument from `Table.make`, wrap the field-schema struct in a `() => ...` callback, and switch any `GenericId.GenericId("users")` references to `Id("users")` imported from `../_generated/id`:

     ```diff
     - import { GenericId } from "@confect/core";
       import { Table } from "@confect/server";
       import { Schema } from "effect";
     + import { Id } from "../_generated/id";

     - export default Table.make(
     -   "notes",
     -   Schema.Struct({
     -     userId: Schema.optional(GenericId.GenericId("users")),
     -     text: Schema.String,
     -   }),
     - );
     + export default Table.make(() =>
     +   Schema.Struct({
     +     userId: Schema.optional(Id("users")),
     +     text: Schema.String,
     +   }),
     + );
     ```

  4. Rewire every consumer site (specs, impls, integration tests, HTTP handlers, etc.) to import from the generated wrapper rather than directly from `tables/`. The wrapper is also where you now read `Doc` / `Fields` / `tableDefinition` (the unnamed `Table.make(...)` callable no longer exposes them):

     ```diff
     - import Notes from "../tables/Notes";
     + import notes from "../_generated/tables/notes";

     - returns: Schema.Array(Notes.Doc),
     + returns: Schema.Array(notes.Doc),
     ```

  5. Replace every remaining `GenericId.GenericId("x")` call site with `Id("x")` from `_generated/id` (in spec `args`/`returns`, in `TaggedError` schemas, in `TestConfect.run`, etc.).
  6. If you read `table.name` anywhere off a bound `Table`, rename it to `table.tableName`.
  7. Re-run `confect codegen`. It will create `confect/_generated/schema.ts`, `confect/_generated/convexSchema.ts`, `confect/_generated/id.ts`, and one `confect/_generated/tables/<name>.ts` wrapper per table; and it will rewrite `convex/schema.ts` to a one-line re-export.
  8. If you use `@confect/test`, pass the generated Convex schema definition to `TestConfect.layer`:

     ```diff
     - import confectSchema from "./confect/schema";
     + import confectSchema from "./confect/_generated/schema";
     + import convexSchema from "./confect/_generated/convexSchema";

       export const layer = TestConfect_.layer(
         confectSchema,
     +   convexSchema,
         import.meta.glob("./convex/**/!(*.*.*)*.*s"),
       );
     ```

  ### New warning: no tables discovered

  If a Confect project has no tables — either `confect/tables/` is missing entirely or it exists but contains no `.ts` files — codegen now emits a yellow `⚠` warning and continues, producing an empty `DatabaseSchema.make()` / `defineSchema({})`. Table-free backends (e.g. action-only proxies, webhook bridges) are still legal; the warning just catches the much more common case of a typoed directory name or files placed at the wrong path. To silence it, add at least one `Table.make(...)` module under `confect/tables/`.

  ### New error: invalid table filename

  Codegen now rejects table files whose basename is not a valid JS identifier (e.g. `user-profiles.ts`), starts with `_` (reserved for Convex system tables), or shadows a reserved JS keyword (e.g. `import.ts`). Rename the offending file to fix it — for example, `user-profiles.ts` → `user_profiles.ts` or `userProfiles.ts`.

### Patch Changes

- Updated dependencies [46045a9]
- Updated dependencies [762f7eb]
  - @confect/core@9.0.0-next.6

## 9.0.0-next.5

### Patch Changes

- @confect/core@9.0.0-next.5

## 9.0.0-next.4

### Patch Changes

- @confect/core@9.0.0-next.4

## 9.0.0-next.3

### Patch Changes

- 6d85210: Resolve `FunctionImpl` / `GroupImpl` group paths via an immutable `paths` map on `Spec` instead of identity-walking the assembled tree.

  ### Why

  Since `9.0.0-next.1`, codegen has wrapped every parent leaf that has sibling subdirectory specs in `<parent>.addGroupAt("child", <child>)`. Because `GroupSpec.addGroupAt` is immutable, that produced a fresh object in the assembled tree, while the parent's `*.impl.ts` continued to hold a reference to the original imported leaf. The runtime resolver compared by `===`, so every such impl failed `validateImpl` with "Could not resolve group path for the provided GroupSpec." Child impls happened to work only because `GroupSpec.withName` was secretly mutating its argument in place to keep the child's identity stable — an asymmetry that was load-bearing for one half of the API and broken for the other.

  ### What changed
  - `@confect/core/Spec` carries a new `readonly paths: ReadonlyMap<GroupSpec.AnyWithProps, string>` field and exposes a chainable `Spec#addPath(group, path)` builder. `add` / `addAt` / `merge` propagate `paths` unchanged; `merge` re-prefixes a node spec's entries with `"node."` to match the merged tree.
  - `@confect/core/GroupSpec.withName` is now pure: it returns a fresh copy when the name differs and no longer rewrites the input in place. No new identity-tracking machinery is introduced.
  - `@confect/server/FunctionImpl.make` and `GroupImpl.make` resolve their group path via `api.spec.paths.get(group)` — an O(1) map lookup instead of a tree walk — and throw a clearer error pointing at `Spec.addPath` when the spec hasn't been registered.
  - `@confect/server/GroupPath` (the old identity-based resolver) is deleted.
  - `@confect/cli` codegen emits one `.addPath(<binding>, "<dot.path>")` call per leaf in `_generated/spec.ts` (and `_generated/nodeSpec.ts`) so the imported leaves carry their full paths into the assembled spec value.

  ### User-facing impact
  - Spec authoring (`*.spec.ts`) and impl authoring (`*.impl.ts`) APIs are unchanged. `FunctionImpl.make(api, spec, name, handler)` and `GroupImpl.make(api, spec)` keep their exact signatures.
  - Generated `_generated/spec.ts` (and `_generated/nodeSpec.ts`) pick up one `.addPath(...)` chain entry per leaf on the next `confect codegen` run. The shape is fully immutable — no module-load mutation, no hidden side effects.
  - Hand-rolled tests that construct a `Spec` and pass it to `Api.make` must now also call `.addPath(spec, "dot.path")` for any group they intend to look up.

  ### Fixes

  This eliminates the runtime regression introduced in `9.0.0-next.1` for any project layout where a `confect/{path}.spec.ts` declares functions alongside a sibling `confect/{path}/` subdirectory of further specs.

- Updated dependencies [6d85210]
  - @confect/core@9.0.0-next.3

## 9.0.0-next.2

### Patch Changes

- @confect/core@9.0.0-next.2

## 9.0.0-next.1

### Patch Changes

- @confect/core@9.0.0-next.1

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

## 8.0.0

### Major Changes

- 87b7207: Renamed `DatabaseSchema.isSchema` to `DatabaseSchema.isDatabaseSchema` for consistency with the `is<TypeName>` predicate convention used elsewhere (e.g. `Spec.isSpec`). `TypeId` and `Any` are now defined in `@confect/core/DatabaseSchema` and re-exported from `@confect/server`; the underlying brand string is unchanged, so existing schema values continue to be recognized. Migration: replace `DatabaseSchema.isSchema(x)` with `DatabaseSchema.isDatabaseSchema(x)`.

  Internally, this removes a cyclic workspace dependency between `@confect/cli` and `@confect/server` that triggered a pnpm install warning. `@confect/cli` no longer peer-depends on `@confect/server`.

### Minor Changes

- 4bb2722: Bump Effect ecosystem to latest. `@effect/platform` is now `^0.96.1` and `@effect/platform-node` is now `^0.106.0` in `@confect/server`'s peer dependencies; `effect` peer is now `^3.21.2` across packages. Consumers must upgrade `@effect/platform`, `@effect/platform-node`, and `effect` in lockstep when bumping `@confect/server`.

### Patch Changes

- f308edd: Fix Convex query cache invalidation when handlers use `Effect.log`, `Effect.withSpan`, or other Effect features that read the clock through its `unsafe*` methods.

  The `Clock` provided to confect-wrapped handlers previously implemented `unsafeCurrentTimeMillis`/`unsafeCurrentTimeNanos` by calling the real `Date.now`, so Effect internals (logging, span events, the default scheduler) would read real time during handler execution and invalidate Convex's per-query cache. Those unsafe methods now return constants (`0`/`0n`), making the only opt-in to cache invalidation the user-facing `Clock.currentTimeMillis`/`Clock.currentTimeNanos` effects, as originally intended.

- a02ef8a: Memoize `Document.decode` and `Document.encode` parsers in module-scoped `WeakMap` caches. Decoders are keyed by table schema and table name so shared schemas across tables get the correct `extendWithSystemFields` parser; encoders are keyed by schema only.
- 40c1cff: Switch sibling `@confect/*` peer-dependency specifiers from `workspace:*` to `workspace:^`. Published peer ranges are now caret-based (e.g. `^7.0.0`) instead of exact-pinned, so non-major upgrades of one `@confect/*` package no longer fall out of range for its peer dependents.

  Paired with the Changesets `onlyUpdatePeerDependentsWhenOutOfRange` flag, this prevents the entire `@confect/*` family from being promoted to a major bump on every release when only minor/patch changes are present.

  `@confect/cli` additionally moves `@effect/platform` from `peerDependencies` to `dependencies`, since the CLI consumes it as an internal implementation detail (for `FileSystem`/`Path`) rather than exposing it in its public API. Consumers no longer need to install `@effect/platform` themselves to use the CLI.

- Updated dependencies [4bb2722]
- Updated dependencies [40c1cff]
  - @confect/core@8.0.0

## 7.0.0

### Minor Changes

- 90094d0: Add typed errors to Confect functions (queries, mutations, and actions). Declare an optional `error` schema in `FunctionSpec` and recover it as a typed value at every call site—`useQuery`, `useMutation`, `useAction`, `HttpClient`, `WebSocketClient`, and `TestConfect`—without paying for it on functions that don't fail.

  Typed errors travel across the function boundary as Convex's native [`ConvexError`](https://docs.convex.dev/functions/error-handling/application-errors#throwing-application-errors): the encoded error sits in `ConvexError.data`, leaving the `returns` channel unsullied and preserving native Convex semantics for non-Confect callers of the same API.

  ### Authoring a function with typed errors

  `FunctionSpec` constructors now accept an optional `error` schema. To support multiple error shapes, combine them with `Schema.Union`.

  ```ts
  import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
  import { Schema } from "effect";

  export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
    "NoteNotFound",
    { noteId: GenericId.GenericId("notes") },
  ) {}

  export const notes = GroupSpec.make("notes").addFunction(
    FunctionSpec.publicQuery({
      name: "getOrFail",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Notes.Doc,
      error: NoteNotFound,
    }),
  );
  ```

  The `FunctionImpl` for that ref can now `Effect.fail` (or `mapError` to) any value matching the declared schema. Whichever invocation path the caller takes—`useQuery`/`useMutation`/`useAction`, `HttpClient`, `WebSocketClient`, or `TestConfect`—Confect encodes the failure, transports it via `ConvexError`, and surfaces the decoded value in the appropriate channel for that call site.

  ```ts
  import { FunctionImpl } from "@confect/server";
  import { Effect } from "effect";
  import api from "../_generated/api";
  import { DatabaseReader } from "../_generated/services";
  import { NoteNotFound } from "./notes.spec";

  const getOrFail = FunctionImpl.make(api, "notes", "getOrFail", ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      return yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NoteNotFound({ noteId })));
    }),
  );
  ```

  ### Consuming a typed error

  `@confect/js` (`HttpClient`, `WebSocketClient`) and `@confect/test` (`TestConfect`) surface the decoded error in the `Effect` error channel alongside the existing `HttpClientError`/`WebSocketClientError`/`ParseError`:

  ```ts
  HttpClient.query(refs.public.notes.getOrFail, { noteId });
  // Effect.Effect<Note, NoteNotFound | HttpClientError | ParseError>
  ```

  ### `@confect/react`—breaking changes

  `useQuery`, `useMutation`, and `useAction` now expose typed errors, and `useQuery` returns a tagged result type instead of `Returns | undefined`.

  **`useQuery` now returns `QueryResult<A, E>`.** Loading and (when an `error` schema is declared) failure are reified as variants alongside success. Match on the result with `QueryResult.match`:

  Before:

  ```tsx
  const notes = useQuery(refs.public.notes.list, {});
  if (notes === undefined) return <p>Loading…</p>;
  return <NoteList notes={notes} />;
  ```

  After:

  ```tsx
  import { QueryResult, useQuery } from "@confect/react";

  const notes = useQuery(refs.public.notes.list, {});
  return QueryResult.match(notes, {
    onLoading: (skipped) => (skipped ? null : <p>Loading…</p>),
    onSuccess: (notes) => <NoteList notes={notes} />,
  });
  ```

  The `Loading` variant carries a `skipped: boolean` flag, exposed as the argument to `onLoading`. It distinguishes a query that is genuinely in flight (`skipped: false`) from one that is sitting idle because `"skip"` was passed as its args (`skipped: true`)—a distinction `convex/react`'s plain `undefined` return value cannot make. Use it to render a loading indicator only when work is actually happening, and an empty/placeholder state otherwise.

  When the ref declares an `error` schema, `onFailure` becomes required and receives the decoded typed error:

  ```tsx
  const lookup = useQuery(refs.public.notes.getOrFail, { noteId });
  QueryResult.match(lookup, {
    onLoading: (skipped) => (skipped ? null : "Looking up…"),
    onSuccess: (note) => `Found: ${note.text}`,
    onFailure: (error) => `Note ${error.noteId} not found.`,
  });
  ```

  `QueryResult` is a Confect-native type exported from `@confect/react`.

  **`useMutation` and `useAction` return `Promise<Either<A, E>>` when the ref declares an `error` schema.** Refs without an `error` schema continue to resolve to `Promise<A>`, matching the prior shape and `convex/react`'s behavior.

  ```ts
  const deleteOrFail = useMutation(refs.public.notes.deleteOrFail);
  const result = await deleteOrFail({ noteId });
  // Either.Either<null, NoteNotFound | Forbidden>
  Either.match(result, {
    onLeft: (error) => /* typed error */,
    onRight: (value) => /* success */,
  });

  const deleteNote = useMutation(refs.public.notes.delete_); // no `error` schema
  await deleteNote({ noteId }); // Promise<null>, as before
  ```

  Unspecified failures continue to reject the promise.

  ### Migration
  - For each `useQuery` call site, replace `result === undefined` checks and direct property access with `QueryResult.match` (or the lower-level `QueryResult.isLoading`/`isSuccess`/`isFailure` predicates).
  - For each `useMutation`/`useAction` call site whose ref now declares an `error` schema, unwrap the resolved `Either` (e.g. with `Either.match`); call sites against refs without an `error` schema need no change.

### Patch Changes

- Updated dependencies [90094d0]
  - @confect/core@7.0.0

## 6.0.0

### Major Changes

- 228589b: Fixed an issue where the cached value for any Confect query would be regularly busted by a hidden Effect dependency on `Date.now()`. This has been solved by stubbing `Date.now()` to always return the Unix epoch (`0`). If you previously relied on `Date.now()` in your queries, (1) try to rewrite them to avoid it (see [Convex best practices](https://docs.convex.dev/understanding/best-practices/#date-in-queries) on using dates in queries), or (2) use Effect's `Clock` service, which will still return an unstubbed timestamp.

### Minor Changes

- df95ce7: Add `Ref.OptionalArgs` type utility to `@confect/core` for conditionally optional function args. `QueryRunner`, `MutationRunner`, and `ActionRunner` now accept optional args for no-arg Confect functions. `useQuery`, `useMutation`, and `useAction` now accept optional args for no-arg Confect functions. `TestConfect` `query`/`mutation`/`action` helpers now accept optional args for no-arg Confect functions.

### Patch Changes

- a8083e8: Fix table field path inference when a schema has a `name` field and an optional Convex ID or bytes field.
- Updated dependencies [df95ce7]
- Updated dependencies [a8083e8]
  - @confect/core@6.0.0

## 5.0.0

### Minor Changes

- 8853cbf: Update `Scheduler` to accept Confect `Ref`s instead of Convex `SchedulableFunctionReference` values. `runAfter` and `runAt` now take a `Ref` to a mutation or action with typed args, aligning the Scheduler API with all other Confect function-calling APIs.

### Patch Changes

- @confect/core@5.0.0

## 4.0.0

### Major Changes

- 60be7e6: Add Effect-native cron job support via new `CronJob` and `CronJobs` modules.

  Cron jobs are now defined using Effect's `Cron` (cron expressions) or `Duration` (fixed intervals) types instead of the vanilla Convex `cronJobs()` API. `CronJob.make` creates individual jobs with a unique identifier, schedule, and ref to an internal mutation or action. `CronJobs.make()` creates an empty collection with a chainable `.add()` method.

  Interval schedules are represented in the largest whole unit possible (hours > minutes > seconds) to avoid floating-point precision issues with large durations.

- 8ae4d51: Standardize all Effect service tags to a consistent `@confect/{package}/{ServiceName}` format.

  The `Storage` namespace export has been removed from `@confect/server`. `StorageReader`, `StorageWriter`, `StorageActionWriter`, and `BlobNotFoundError` are now exported as individual top-level namespaces. Replace `Storage.StorageReader` with `StorageReader.StorageReader`, etc. After upgrading, rerun `confect codegen` to regenerate the `services.ts` file.

### Minor Changes

- 641fd99: Add optional `filter` parameter to `OrderedQuery.paginate`. This allows applying a Convex filter directly at the pagination level—the one scenario where `.filter()` is recommended over index-based filtering. The filter callback receives a `FilterBuilder` and is applied to the underlying query before paginating.

### Patch Changes

- @confect/core@4.0.0

## 3.0.0

### Minor Changes

- 5fb6a61: Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.

### Patch Changes

- Updated dependencies [5fb6a61]
  - @confect/core@3.0.0

## 2.0.0

### Minor Changes

- f78c58a: Add support for `Config` usage in Convex runtime functions. Effect's default `ConfigProvider` doesn't work because `process.env` is not enumerable in the Convex runtime. The new `ConvexConfigProvider` supports the same options as Effect's default `ConfigProvider.fromEnv`, but is also provided to Convex runtime functions by default. Configs which require enumeration are still unsupported, until/unless this Convex runtime limitation is removed.

### Patch Changes

- 69ce9c9: Improve type-checking performance of `SchemaToValidator` compilation.
  - @confect/core@2.0.0

## 1.0.3

### Patch Changes

- @confect/core@1.0.3

## 1.0.2

### Patch Changes

- c4f9d67: Fix return types of `MutationRunner` and `ActionRunner` services
  - @confect/core@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [00b12a0]
  - @confect/core@1.0.1

## 1.0.0

### Major Changes

- 2ff70a7: Initial release.

## 1.0.0-next.4

### Patch Changes

- 46109fb: Support Node actions
- Updated dependencies [46109fb]
  - @confect/core@1.0.0-next.4

## 1.0.0-next.3

### Patch Changes

- 9cd3cda: `confect/_generated/refs.ts` now default exports the `Refs` object, which now contains `public` and `internal` fields for each corresponding collection of Confect functions
- 186c130: `FunctionSpec.query` becomes `FunctionSpec.publicQuery`, same for mutations and actions
- Updated dependencies [9cd3cda]
- Updated dependencies [186c130]
  - @confect/core@1.0.0-next.3

## 1.0.0-next.2

### Patch Changes

- 071b6ed: Upgrade deps
- afc9fb4: Refactor `DatabaseWriter` API to match `DatabaseReader` (`writer.insert("notes", { text })` becomes `writer.table("notes").insert({ text })`, and so on)
- Updated dependencies [071b6ed]
  - @confect/core@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [5a4127f]
  - @confect/core@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 2ff70a7: Initial release.

### Patch Changes

- Updated dependencies [2ff70a7]
  - @confect/core@1.0.0-next.0
