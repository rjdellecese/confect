# @rjdellecese/confect

## 0.0.18

### Patch Changes

- d36279d: Use new `@effect/platform` Scalar integration

## 0.0.17

### Patch Changes

- ea92ea9: Scope monkey patches to HTTP router creation only, bump some deps

## 0.0.16

### Patch Changes

- d7c5a10: Add support for refinements

## 0.0.15

### Patch Changes

- 9e43859: Improve error reporting when schema compilation fails

## 0.0.14

### Patch Changes

- 21df7ec: Expose `compileSchema`. Use this to convert a `Schema<A, I>` to a `Validator<I>`.

## 0.0.13

### Patch Changes

- 5f349a0: `convex`, `effect`, and `@effect/platform` are now peer dependencies

## 0.0.12

### Patch Changes

- 2ddd275: Upgrade deps, remove `@effect/schema` (Schema [has been merged](https://effect.website/blog/effect-3.10) into the main `effect` package)

## 0.0.11

### Patch Changes

- 3b29bc7: Fix `@scalar/api-reference` version

  Expose `HttpApi` type

## 0.0.10

### Patch Changes

- 34fb52e: Properly support Convex ID `Schema` to `Validator` compilation

## 0.0.9

### Patch Changes

- 22a12b4: Support unions in table definition

## 0.0.8

### Patch Changes

- 3f68035: Add HTTP API integration from `@effect/platform` and update deps

## 0.0.7

### Patch Changes

- a688061: Bump deps
- 1adc84e: Create new `server` and `react` modules, add new `tableSchemas` property to `ConfectSchemaDefinition`

## 0.0.6

### Patch Changes

- 5d622b9: `defineConfectSchema` -> `defineSchema`
  `defineConfectTable` -> `defineTable`

## 0.0.5

### Patch Changes

- de76990: Add `LICENSE` and `README.md`

## 0.0.4

### Patch Changes

- e789ec4: Improve building process/namespacing

## 0.0.3

### Patch Changes

- f5831ef: Bump typescript from 5.5.4 to 5.6.2
- 6dd64a6: Use dependency version ranges rather than exact
- ed4a4e2: Fix branded type usage

## 0.0.2

### Patch Changes

- 3d55f35: Improve API
- abfda3d: Upgrade dependencies
