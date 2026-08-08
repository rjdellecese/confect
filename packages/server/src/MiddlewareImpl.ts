import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Registry from "@confect/core/Registry";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Ref from "effect/Ref";
import type * as Auth from "./Auth";
import type * as DatabaseReader from "./DatabaseReader";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryRunner from "./QueryRunner";
import type * as Scheduler from "./Scheduler";
import type * as StorageReader from "./StorageReader";
import type * as StorageWriter from "./StorageWriter";
import { setNestedProperty } from "./internal/utils";

/**
 * Marker service produced by providing a middleware's implementation to a
 * group's impl layer. `GroupImpl.make` requires one per middleware attached
 * to the group's spec (via {@link FromGroupSpec}), so `GroupImpl.finalize`'s
 * `RIn = never` bound rejects a group that attaches a middleware but never
 * provides its implementation — the exact mechanism used for
 * `FunctionImpl`s.
 */
export interface MiddlewareImpl<MiddlewareKey extends string> {
  readonly middlewareKey: MiddlewareKey;
}

export const MiddlewareImpl = <MiddlewareKey extends string>({
  middlewareKey,
}: {
  middlewareKey: MiddlewareKey;
}) =>
  Context.Service<MiddlewareImpl<MiddlewareKey>>(
    `@confect/server/MiddlewareImpl/${middlewareKey}`,
  );

/**
 * The `MiddlewareImpl` services a group spec's attached middleware require.
 */
export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  GroupSpec.Middlewares<Group> extends infer Middleware
    ? Middleware extends MiddlewareSpec.AnyService
      ? MiddlewareImpl<MiddlewareSpec.Key<Middleware>>
      : never
    : never;

/** The full ctx-service union for one function kind. */
export type KindServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Kind extends MiddlewareSpec.FunctionKind,
> = Kind extends "query"
  ? Handler.QueryServices<DatabaseSchema_>
  : Kind extends "mutation"
    ? Handler.MutationServices<DatabaseSchema_>
    : Kind extends "action"
      ? Handler.ActionServices<DatabaseSchema_>
      : never;

/**
 * The services a single middleware implementation may use: the set-theoretic
 * intersection of the ctx-service unions of the middleware's declared
 * `kinds`, so one implementation is valid in every runtime it can be invoked
 * in. Enumerated by hand rather than derived with `Exclude`/`Extract` —
 * several ctx services are structurally typed (e.g. the raw
 * `GenericQueryCtx`/`GenericMutationCtx` tags), so conditional-type set
 * arithmetic over them is not reliable.
 *
 * Note the singleton cases resolve to that kind's full union, and every
 * combination involving both `"query"` and `"action"` bottoms out at
 * `Auth | StorageReader | QueryRunner`. A database-touching middleware that
 * declares all three kinds should use {@link makeByKind} rather than lean on
 * `QueryRunner` — Convex best practices reserve `runQuery` for actions.
 */
export type CommonServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Kinds extends MiddlewareSpec.FunctionKind,
> = [Kinds] extends ["query"]
  ? Handler.QueryServices<DatabaseSchema_>
  : [Kinds] extends ["mutation"]
    ? Handler.MutationServices<DatabaseSchema_>
    : [Kinds] extends ["action"]
      ? Handler.ActionServices<DatabaseSchema_>
      : [Kinds] extends ["query" | "mutation"]
        ? QueryMutationCommonServices<DatabaseSchema_>
        : [Kinds] extends ["mutation" | "action"]
          ? MutationActionCommonServices
          : AllKindsCommonServices;

type QueryMutationCommonServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> =
  | DatabaseReader.DatabaseReader<DatabaseSchema_>
  | Auth.Auth
  | StorageReader.StorageReader
  | QueryRunner.QueryRunner;

type MutationActionCommonServices =
  | Auth.Auth
  | Scheduler.Scheduler
  | StorageReader.StorageReader
  | StorageWriter.StorageWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner;

type AllKindsCommonServices =
  | Auth.Auth
  | StorageReader.StorageReader
  | QueryRunner.QueryRunner;

export const RegistryItemTypeId = "@confect/server/MiddlewareImpl/RegistryItem";
export type RegistryItemTypeId = typeof RegistryItemTypeId;

/**
 * The registry entry a middleware implementation registers under
 * `middleware:<key>` — a key shape no `FunctionImpl` can collide with, since
 * function names are validated identifiers and cannot contain `:`.
 */
export interface RegistryItem {
  readonly [RegistryItemTypeId]: RegistryItemTypeId;
  readonly middleware: MiddlewareSpec.AnyService;
  readonly impls: Partial<
    Record<MiddlewareSpec.FunctionKind, MiddlewareSpec.AnyMiddleware>
  >;
}

export const isRegistryItem = (u: unknown): u is RegistryItem =>
  Predicate.hasProperty(u, RegistryItemTypeId);

export const registryKey = (middlewareKey: string): string =>
  `middleware:${middlewareKey}`;

const layerFromImpls = <Middleware extends MiddlewareSpec.AnyService>(
  middleware: Middleware,
  impls: RegistryItem["impls"],
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<Middleware>>> =>
  Layer.effect(
    MiddlewareImpl<MiddlewareSpec.Key<Middleware>>({
      middlewareKey: middleware.key,
    }),
    Effect.gen(function* () {
      const registry = yield* Registry.Registry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(registryItems, [registryKey(middleware.key)], {
          [RegistryItemTypeId]: RegistryItemTypeId,
          middleware,
          impls,
        } satisfies RegistryItem),
      );

      return { middlewareKey: middleware.key };
    }),
  );

/**
 * Provide a middleware's implementation with a single strategy shared by
 * every kind the middleware declares. The implementation's environment is
 * bounded by {@link CommonServices} — the intersection of the declared
 * kinds' ctx services — so it is valid wherever it can be invoked. Reach for
 * {@link makeByKind} when one strategy can't fit all declared kinds (the
 * usual case for database-touching middleware attached to actions).
 *
 * Like `FunctionImpl.make`, `databaseSchema` is a type-level carrier only.
 */
export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Middleware extends MiddlewareSpec.AnyService,
>(
  _databaseSchema: DatabaseSchema_,
  middleware: Middleware,
  impl: MiddlewareSpec.Middleware<
    MiddlewareSpec.Provides<Middleware>,
    MiddlewareSpec.Error<Middleware>,
    CommonServices<DatabaseSchema_, MiddlewareSpec.Kinds<Middleware>>
  >,
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<Middleware>>> =>
  layerFromImpls(
    middleware,
    Object.fromEntries(
      middleware.kinds.map((kind) => [
        kind,
        impl as MiddlewareSpec.AnyMiddleware,
      ]),
    ),
  );

/**
 * Provide a middleware's implementation with one strategy per declared kind.
 * Each entry may use that kind's full ctx-service union — the recommended
 * shape for database-touching middleware that also covers actions: use
 * `DatabaseReader`/`DatabaseWriter` in queries and mutations, and `runQuery`
 * of an internal query in actions.
 */
export const makeByKind = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Middleware extends MiddlewareSpec.AnyService,
>(
  _databaseSchema: DatabaseSchema_,
  middleware: Middleware,
  impls: {
    readonly [Kind in MiddlewareSpec.Kinds<Middleware>]: MiddlewareSpec.Middleware<
      MiddlewareSpec.Provides<Middleware>,
      MiddlewareSpec.Error<Middleware>,
      KindServices<DatabaseSchema_, Kind>
    >;
  },
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<Middleware>>> =>
  layerFromImpls(middleware, impls as RegistryItem["impls"]);

/**
 * Sugar over {@link make} for the flagship "run something, provide a
 * service" shape: run `effect` before the rest of the chain and provide its
 * result under `tag` (the runtime tag for the middleware's type-level
 * `provides` service, passed explicitly since the spec class only knows it
 * at the type level).
 */
export const provides = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Middleware extends MiddlewareSpec.AnyService,
  Shape,
>(
  databaseSchema: DatabaseSchema_,
  middleware: Middleware,
  tag: Context.Key<MiddlewareSpec.Provides<Middleware>, Shape>,
  effect: Effect.Effect<
    Shape,
    MiddlewareSpec.Error<Middleware>,
    CommonServices<DatabaseSchema_, MiddlewareSpec.Kinds<Middleware>>
  >,
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<Middleware>>> =>
  make(databaseSchema, middleware, ((handlerEffect: Effect.Effect<any>) =>
    Effect.provideServiceEffect(handlerEffect, tag, effect)) as any);
