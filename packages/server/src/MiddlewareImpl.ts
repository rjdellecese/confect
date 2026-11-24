import * as Record from "effect/Record";
import * as Array from "effect/Array";
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
import type * as DocumentIds from "./DocumentIds";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";
import type { ExecutionMetadata } from "./ExecutionMetadata";
import type { RequestMetadata } from "./RequestMetadata";
import type { TransactionMetadata } from "./TransactionMetadata";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryRunner from "./QueryRunner";
import type { QueryTransactionContext } from "./QueryTransactionContext";
import type * as Scheduler from "./Scheduler";
import type { Storage } from "./Storage";
import type * as StorageActionWriter from "./StorageActionWriter";
import type * as StorageReader from "./StorageReader";
import type * as StorageWriter from "./StorageWriter";
import * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";
import { setNestedProperty } from "./internal/utils";

/**
 * Service that marks a middleware spec as implemented. A group needs an
 * implementation for each middleware attached to the group or to any of its
 * functions before `GroupImpl.finalize` accepts the layer.
 *
 * @category Services
 */
export interface MiddlewareImpl<MiddlewareKey extends string> {
  /**
   * Key of the middleware spec implemented by this layer.
   *
   * @category Models
   */
  readonly middlewareKey: MiddlewareKey;
}

/**
 * @internal
 */
export const MiddlewareImpl = <MiddlewareKey extends string>({
  middlewareKey,
}: {
  middlewareKey: MiddlewareKey;
}) =>
  Context.Service<MiddlewareImpl<MiddlewareKey>>(
    `@confect/server/MiddlewareImpl/${middlewareKey}`,
  );

/**
 * @internal
 */
export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  | GroupSpec.MiddlewareSpecs<Group>
  | FunctionSpec.MiddlewareSpecs<
      GroupSpec.Functions<Group>
    > extends infer MiddlewareSpec_
  ? MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec
    ? MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>
    : never
  : never;

/**
 * @internal
 */
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
 * `functionTypes`, so one implementation is valid in every runtime it can be
 * invoked in. Enumerated by hand rather than derived with
 * `Exclude`/`Extract`—several ctx services are structurally typed (e.g. the raw
 * `GenericQueryCtx`/`GenericMutationCtx` tags), so conditional-type set
 * arithmetic over them is not reliable.
 *
 * @internal
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
  | DocumentIds.DocumentIds<DatabaseSchema_>
  | Auth.Auth
  | ExecutionMetadata
  | TransactionMetadata
  | QueryTransactionContext
  | Storage
  | StorageReader.StorageReader
  | QueryRunner.QueryRunner;

type MutationActionCommonServices =
  | Auth.Auth
  | ExecutionMetadata
  | RequestMetadata
  | Scheduler.Scheduler
  | Storage
  | StorageReader.StorageReader
  | StorageWriter.StorageWriter
  | StorageActionWriter.StorageActionWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner;

type AllFunctionTypesCommonServices =
  | Auth.Auth
  | ExecutionMetadata
  | Storage
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
 * Application-typed middleware builders exported as `MiddlewareImpl` by
 * `_generated/server`. They type each wrapper's database services against the
 * application's schema.
 *
 * @remarks
 *   Codegen support: this interface names the generated builder shape; do not
 *   import it directly. Import `MiddlewareImpl` from
 *   `confect/_generated/server` for `make`, `makeByFunctionType`, and
 *   `provides`. For the builder's type, use `typeof MiddlewareImpl`.
 *
 * @category Models
 */
export interface Builders<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> {
  /**
   * Creates a middleware layer that uses the same wrapper for every function
   * type declared in the spec.
   *
   * **Details**
   *
   * A shared wrapper can use services common to all of those function types,
   * plus requirements declared by the spec and provided by earlier middleware.
   *
   * @category Layers
   *
   * @param middlewareSpec - Middleware declaration to implement.
   * @param impl - Function that wraps the downstream Effect. It receives
   *   invocation metadata and, if declared, the attachment options. It may
   *   provide the spec's service and fail with its declared error.
   *
   * @returns A layer to provide to each group that uses the middleware.
   *
   * @see `MiddlewareImpl.makeByFunctionType` for wrappers that need services specific to one function type.
   */
  readonly make: <MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    middlewareSpec: MiddlewareSpec_,
    impl: MiddlewareSpec.MiddlewareImpl<
      MiddlewareSpec.Provides<MiddlewareSpec_>,
      MiddlewareSpec.Error<MiddlewareSpec_>,
      | CommonServices<
          DatabaseSchema_,
          MiddlewareSpec.FunctionTypes<MiddlewareSpec_>
        >
      | MiddlewareSpec.Requires<MiddlewareSpec_>,
      MiddlewareSpec.Options<MiddlewareSpec_>
    >,
  ) => Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>>;

  /**
   * Creates a middleware layer from a separate wrapper for each function type
   * declared in the spec.
   *
   * **When to use**
   *
   * Use when the wrapper needs different services in different runtimes, such
   * as a database reader in a query and a query runner in an action.
   *
   * @category Layers
   *
   * @param middlewareSpec - Middleware declaration to implement.
   * @param impls - One wrapper per declared function type, each receiving the
   *   downstream Effect, invocation metadata, and any declared attachment
   *   options.
   *
   * @returns A layer to provide to each group that uses the middleware.
   */
  readonly makeByFunctionType: <
    MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec,
  >(
    middlewareSpec: MiddlewareSpec_,
    impls: {
      readonly [
        FunctionType_ in MiddlewareSpec.FunctionTypes<MiddlewareSpec_>
      ]: MiddlewareSpec.MiddlewareImpl<
        MiddlewareSpec.Provides<MiddlewareSpec_>,
        MiddlewareSpec.Error<MiddlewareSpec_>,
        | FunctionTypeServices<DatabaseSchema_, FunctionType_>
        | MiddlewareSpec.Requires<MiddlewareSpec_>,
        MiddlewareSpec.Options<MiddlewareSpec_>
      >;
    },
  ) => Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>>;

  /**
   * Creates a middleware layer that runs an Effect at invocation time and
   * provides its result as a service to the downstream handler.
   *
   * @category Layers
   *
   * @param middlewareSpec - Middleware declaration to implement.
   * @param tag - Service tag for the spec's declared service.
   * @param effect - Effect that computes the service using dependencies
   *   available to a shared wrapper. Its failures must fit the middleware's
   *   declared error.
   *
   * @returns An implementation layer to provide to each group that uses the
   *   middleware.
   *
   * @see `MiddlewareImpl.make` when computing the service requires attachment options or invocation metadata.
   */
  readonly provides: <
    MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec,
    Shape,
  >(
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
  ) => Layer.Layer<MiddlewareImpl<MiddlewareSpec.Key<MiddlewareSpec_>>>;
}

const sharedLayer = <Spec extends MiddlewareSpec.AnyMiddlewareSpec, R>(
  middlewareSpec: Spec,
  impl: MiddlewareSpec.MiddlewareImpl<
    MiddlewareSpec.Provides<Spec>,
    MiddlewareSpec.Error<Spec>,
    R,
    MiddlewareSpec.Options<Spec>
  >,
) =>
  layerFromImpls(
    middlewareSpec,
    Record.fromEntries(
      Array.map(
        Array.filter(
          MiddlewareSpec.allFunctionTypes,
          (functionType) => middlewareSpec.functionTypes[functionType],
        ),
        (functionType) =>
          [functionType, impl as MiddlewareSpec.AnyMiddlewareImpl] as const,
      ),
    ),
  );

/**
 * Binds the application's database type without loading its tables. Use
 * `MiddlewareImpl.make`, `MiddlewareImpl.makeByFunctionType`, or
 * `MiddlewareImpl.provides` from `confect/_generated/server` instead of binding
 * the builder directly.
 *
 * @internal
 */
export const forSchema = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): Builders<DatabaseSchema_> => ({
  make: sharedLayer,
  makeByFunctionType: (middlewareSpec, impls) =>
    layerFromImpls(
      middlewareSpec,
      impls as MiddlewareRegistryItem.MiddlewareRegistryItem["impls"],
    ),
  provides: (middlewareSpec, tag, effect) =>
    sharedLayer(middlewareSpec, (handlerEffect) =>
      Effect.provideServiceEffect(handlerEffect, tag, effect),
    ),
});

export const {
  /**
   * Creates a middleware layer with one wrapper shared across the spec's
   * function types, without specializing its database services. Import
   * `MiddlewareImpl` from `_generated/server` for the application-typed `make`
   * method.
   *
   * @category Layers
   */
  make,
  /**
   * Creates a middleware layer with one wrapper per declared function type,
   * without specializing its database services. The generated `MiddlewareImpl`
   * exposes `MiddlewareImpl.makeByFunctionType` with application-typed
   * services.
   *
   * @category Layers
   */
  makeByFunctionType,
  /**
   * Creates a middleware layer that supplies a service to the downstream
   * handler without specializing database services. The generated
   * `MiddlewareImpl` exposes `provides` with application-typed services.
   *
   * @category Layers
   */
  provides,
} = forSchema<DatabaseSchema.AnyWithProps>();
