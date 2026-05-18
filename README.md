# Confect 🧁

Confect is a framework that deeply integrates Effect with Convex. It's more than just Effect bindings! Confect allows you to:

- Define your Convex database schema using Effect schemas.
- Write Convex function args and returns validators using Effect's schema library.
- Use Confect functions to automatically decode and encode your data according to your Effect schema definitions for end-to-end rich types, from client to function to database (and back).
- Use Effect's HTTP API modules to define your HTTP API(s). Includes interactive OpenAPI documentation powered by [Scalar](https://github.com/scalar/scalar).
- Access Convex platform capabilities via Effect services.

Want to learn more? Read the [docs](https://confect.dev)!

---

## Effect 4 prerelease (`effect4` channel)

This branch (`effect4`) tracks Confect's port to **Effect 4.0.0-beta** alongside the stable Effect 3 release on `main`. Both ship from the same npm packages, on different dist-tags:

| Channel                | Effect          | Convex    | Install                            |
| ---------------------- | --------------- | --------- | ---------------------------------- |
| stable (`latest`)      | `^3.21.2`       | `^1.30.0` | `pnpm add @confect/server`         |
| prerelease (`effect4`) | `4.0.0-beta.67` | `^1.39.0` | `pnpm add @confect/server@effect4` |

The `effect4` releases come out of the `effect4` branch via [`.github/workflows/release-effect4.yml`](.github/workflows/release-effect4.yml), which uses changesets prerelease mode (see [`.changeset/pre.json`](.changeset/pre.json)) plus each package's `publishConfig.tag: "effect4"` to land versions like `@confect/server@8.0.0-effect4.X` without overwriting the stable `latest` tag.

When Effect 4 stabilizes, this branch will exit prerelease mode (`pnpm changeset pre exit`) and merge into `main` as the next major.

### What changed

Schema API, Effect/Stream/Layer/Result, and Context tag shape all changed. Full v3 → v4 rename tables and worked examples live in [**Migrating to Effect 4**](apps/docs/guides/migrating-to-effect-4.mdx).

The most common Confect-user touchpoint is the schema-type accessor:

```ts
// v3
const Args = Schema.Struct({ id: Schema.String });
const handler = (a: Schema.Schema.Type<typeof Args>) => Effect.succeed(null);

// v4
const Args = Schema.Struct({ id: Schema.String });
const handler = (a: typeof Args.Type) => Effect.succeed(null);
```

### Per-package status on `effect4`

| Package           | Typecheck | Build                | Notes                                                                          |
| ----------------- | --------- | -------------------- | ------------------------------------------------------------------------------ |
| `@confect/core`   | clean     | 153.8 kB / 59 files  | —                                                                              |
| `@confect/server` | clean     | 395.1 kB / 165 files | HTTP API uses Effect 4's `HttpRouter.toWebHandler` and request-scoped services |
| `@confect/js`     | clean     | 29.6 kB / 11 files   | `WebSocketClient` ported to `Stream.callback`                                  |
| `@confect/react`  | clean     | 26.3 kB / 9 files    | —                                                                              |
| `@confect/test`   | clean     | 18.6 kB / 7 files    | —                                                                              |
| `@confect/cli`    | clean     | 175.4 kB / 37 files  | included in the prerelease with local Node runtime shims                       |
