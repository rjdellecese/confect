import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Registry from "./Registry";
import type { FunctionType } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
import * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";
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

export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  | GroupSpec.MiddlewareSpecs<Group>
  | FunctionSpec.MiddlewareSpecs<
      GroupSpec.Functions<Group>
    > extends infer MiddlewareSpec_
  ? MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec
    ? MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>
    : never
  : never;

export type FunctionTypeServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionType_ extends FunctionType,
> = FunctionType_ extends "query"
  ? Handler.QueryServices<DatabaseSchema_>
  : FunctionType_ extends "mutation"
    ? Handler.MutationServices<DatabaseSchema_>
    : FunctionType_ extends "action"
      ? Handler.ActionServices<DatabaseSchema_>
      : never;

/**
 * The services a single middleware implementation may use: the set-theoretic
 * intersection of the ctx-service unions of the middleware's declared
 * `functionTypes`, so one implementation is valid in every runtime it can be invoked
 * in. Enumerated by hand rather than derived with `Exclude`/`Extract` —
 * several ctx services are structurally typed (e.g. the raw
 * `GenericQueryCtx`/`GenericMutationCtx` tags), so conditional-type set
 * arithmetic over them is not reliable.
 */
export type CommonServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionTypes extends FunctionType,
> = [FunctionTypes] extends ["query"]
  ? Handler.QueryServices<DatabaseSchema_>
  : [FunctionTypes] extends ["mutation"]
    ? Handler.MutationServices<DatabaseSchema_>
    : [FunctionTypes] extends ["action"]
      ? Handler.ActionServices<DatabaseSchema_>
      : [FunctionTypes] extends ["query" | "mutation"]
        ? QueryMutationCommonServices<DatabaseSchema_>
        : [FunctionTypes] extends ["mutation" | "action"]
          ? MutationActionCommonServices
          : AllFunctionTypesCommonServices;

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

type AllFunctionTypesCommonServices =
  | Auth.Auth
  | StorageReader.StorageReader
  | QueryRunner.QueryRunner;

const layerFromImpls = <
  MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec,
>(
  middlewareSpec: MiddlewareSpec_,
  impls: MiddlewareRegistryItem.MiddlewareRegistryItem["impls"],
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>> =>
  Layer.effect(
    MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>({
      middlewareKey: middlewareSpec.key,
    }),
    Effect.gen(function* () {
      const registry = yield* Registry.Registry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(
          registryItems,
          [MiddlewareRegistryItem.registryKey(middlewareSpec.key)],
          {
            [MiddlewareRegistryItem.TypeId]: MiddlewareRegistryItem.TypeId,
            middlewareSpec,
            impls,
          } satisfies MiddlewareRegistryItem.MiddlewareRegistryItem,
        ),
      );

      return { middlewareKey: middlewareSpec.key };
    }),
  );

/**
 * Provide a middleware's implementation with a single strategy shared by
 * every function type the middleware declares. The implementation's environment is
 * bounded by {@link CommonServices} — the intersection of the declared
 * functionTypes' ctx services — plus the middleware's declared `requires`, which
 * middleware running earlier in the chain provide. Reach for
 * {@link makeByFunctionType} when one strategy can't fit all declared functionTypes (the
 * usual case for database-touching middleware attached to actions).
 *
 * Like `FunctionImpl.make`, `databaseSchema` is a type-level carrier only.
 */
export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec,
>(
  _databaseSchema: DatabaseSchema_,
  middlewareSpec: MiddlewareSpec_,
  impl: MiddlewareSpec.MiddlewareImpl<
    MiddlewareSpec.Provides<MiddlewareSpec_>,
    MiddlewareSpec.Error<MiddlewareSpec_>,
    | CommonServices<
        DatabaseSchema_,
        MiddlewareSpec.FunctionTypes<MiddlewareSpec_>
      >
    | MiddlewareSpec.Requires<MiddlewareSpec_>
  >,
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>> =>
  layerFromImpls(
    middlewareSpec,
    Object.fromEntries(
      MiddlewareSpec.allFunctionTypes
        .filter((functionType) => middlewareSpec.functionTypes[functionType])
        .map((functionType) => [
          functionType,
          impl as MiddlewareSpec.AnyMiddlewareImpl,
        ]),
    ),
  );

/**
 * Provide a middleware's implementation with one strategy per declared function type.
 * Each entry may use that function type's full ctx-service union — the recommended
 * shape for database-touching middleware that also covers actions: use
 * `DatabaseReader`/`DatabaseWriter` in queries and mutations, and `runQuery`
 * of an internal query in actions.
 */
export const makeByFunctionType = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec,
>(
  _databaseSchema: DatabaseSchema_,
  middlewareSpec: MiddlewareSpec_,
  impls: {
    readonly [
      FunctionType_ in MiddlewareSpec.FunctionTypes<MiddlewareSpec_>
    ]: MiddlewareSpec.MiddlewareImpl<
      MiddlewareSpec.Provides<MiddlewareSpec_>,
      MiddlewareSpec.Error<MiddlewareSpec_>,
      | FunctionTypeServices<DatabaseSchema_, FunctionType_>
      | MiddlewareSpec.Requires<MiddlewareSpec_>
    >;
  },
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>> =>
  layerFromImpls(
    middlewareSpec,
    impls as MiddlewareRegistryItem.MiddlewareRegistryItem["impls"],
  );

/**
 * Sugar over {@link make} for the flagship "run something, provide a
 * service" shape: run `effect` before the rest of the chain and provide its
 * result under `tag` (the runtime tag for the middleware's type-level
 * `provides` service, passed explicitly since the spec class only knows it
 * at the type level).
 */
export const provides = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec,
  Shape,
>(
  databaseSchema: DatabaseSchema_,
  middlewareSpec: MiddlewareSpec_,
  tag: Context.Key<MiddlewareSpec.Provides<MiddlewareSpec_>, Shape>,
  effect: Effect.Effect<
    Shape,
    MiddlewareSpec.Error<MiddlewareSpec_>,
    | CommonServices<
        DatabaseSchema_,
        MiddlewareSpec.FunctionTypes<MiddlewareSpec_>
      >
    | MiddlewareSpec.Requires<MiddlewareSpec_>
  >,
): Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>> =>
  make(databaseSchema, middlewareSpec, ((handlerEffect: Effect.Effect<any>) =>
    Effect.provideServiceEffect(handlerEffect, tag, effect)) as any);
