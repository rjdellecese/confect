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
 * Service provided by a middleware implementation layer. A group needs one
 * implementation for each middleware attached to the group or its functions
 * before `GroupImpl.finalize` accepts the layer.
 *
 * @category Models
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
 * The schema-typed `MiddlewareImpl` builders exported by `_generated/server`.
 *
 * @category Models
 */
export interface Builders<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> {
  /**
   * Use one wrapper for every function type the middleware supports. It can use
   * services shared by those runtimes and the spec's declared requirements
   * supplied by earlier middleware.
   *
   * @category Layers
   *
   * @param middlewareSpec - Middleware declaration to implement.
   * @param impl - Wrap the downstream Effect using invocation metadata and,
   *   when declared, attachment options. The wrapper may provide the spec's
   *   service and fail with its declared error.
   *
   * @returns A layer to provide to each group using the middleware.
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
   * Use a separate wrapper for each supported function type. Each wrapper can
   * use the services of its own runtime: for example, read directly in a query
   * or mutation and call an internal query from an action.
   *
   * @category Layers
   *
   * @param middlewareSpec - Middleware declaration to implement.
   * @param impls - One wrapper per declared function type, each receiving the
   *   downstream Effect, invocation metadata and any declared options.
   *
   * @returns A layer to provide to each group using the middleware.
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
   * Run an Effect before the downstream handler and provide its result as a
   * service. Use {@link Builders.make | make} instead if computing the service
   * needs the attachment options or invocation metadata.
   *
   * @category Layers
   *
   * @param middlewareSpec - Middleware declaration to implement.
   * @param tag - Runtime tag for the spec's declared service.
   * @param effect - Compute the service using dependencies available to a
   *   shared wrapper. Its failures must fit the middleware's declared error.
   *
   * @returns A layer that supplies the computed service downstream.
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

/**
 * Bind middleware strategies to the application's data model at the type level.
 *
 * @internal
 */
export const forSchema = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): Builders<DatabaseSchema_> => {
  const make: Builders<DatabaseSchema_>["make"] = (middlewareSpec, impl) =>
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

  return {
    make,
    makeByFunctionType: (middlewareSpec, impls) =>
      layerFromImpls(
        middlewareSpec,
        impls as MiddlewareRegistryItem.MiddlewareRegistryItem["impls"],
      ),
    provides: (middlewareSpec, tag, effect) =>
      make(middlewareSpec, ((handlerEffect: Effect.Effect<any>) =>
        Effect.provideServiceEffect(handlerEffect, tag, effect)) as any),
  };
};

export const {
  /**
   * Share one wrapper across the spec's function types without specializing its
   * database services. For the application-typed {@link Builders.make} method,
   * import `MiddlewareImpl` from `_generated/server`.
   *
   * @category Layers
   */
  make,
  /**
   * Provide one wrapper per declared function type without specializing its
   * database services. Use {@link Builders.makeByFunctionType} from the
   * generated `MiddlewareImpl` for application-typed services.
   *
   * @category Layers
   */
  makeByFunctionType,
  /**
   * Supply a service to the downstream handler without specializing database
   * services. Use {@link Builders.provides} from the generated `MiddlewareImpl`
   * for application-typed services.
   *
   * @category Layers
   */
  provides,
} = forSchema<DatabaseSchema.AnyWithProps>();
