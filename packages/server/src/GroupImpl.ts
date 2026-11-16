import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Registry from "./Registry";
import * as RegistryItems from "./RegistryItems";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Ref from "effect/Ref";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as FunctionImpl from "./FunctionImpl";
import type * as MiddlewareImpl from "./MiddlewareImpl";

/**
 * @internal
 */
export const TypeId = "~@confect/server/GroupImpl";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export type FinalizationStatus = "Unfinalized" | "Finalized";

/**
 * Group implementation layer's service. The status distinguishes a layer still
 * awaiting implementations from one finalized for the codegen entry point.
 * Build through make/provide/finalize rather than constructing this value.
 *
 * @category Models
 */
export interface GroupImpl<
  FinalizationStatus_ extends FinalizationStatus = "Unfinalized",
> {
  /**
   * @internal
   */
  readonly [TypeId]: TypeId;
  /**
   * @internal
   */
  readonly finalizationStatus: FinalizationStatus_;
  /**
   * Names of every function registered into this group's layer scope by
   * `FunctionImpl.make`. Authoritative only when `finalizationStatus` is
   * `"Finalized"`; the `"Unfinalized"` value is set to `[]` at `make`-time
   * since the list is only known once `finalize` snapshots the registry.
   *
   * @internal
   */
  readonly registeredFunctionNames: ReadonlyArray<string>;
  /**
   * Keys of every middleware whose implementation registered into this group's
   * layer scope via `MiddlewareImpl.make` (and friends). Same authoritativeness
   * caveat as `registeredFunctionNames`. Lets consumers (the CLI's
   * `validateImpl`) verify middleware-impl completeness against a `GroupSpec`'s
   * attached middleware without inspecting the `Registry`.
   *
   * @internal
   */
  readonly registeredMiddlewareKeys: ReadonlyArray<string>;
}

/**
 * @internal
 */
export interface Any extends GroupImpl<FinalizationStatus> {}

/**
 * @internal
 */
export const isGroupImpl = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * @internal
 */
export interface AnyFinalized extends GroupImpl<"Finalized"> {}
/**
 * @internal
 */
export interface AnyUnfinalized extends GroupImpl<"Unfinalized"> {}

/**
 * @internal
 */
export const isFinalizedGroupImpl = (u: unknown): u is AnyFinalized =>
  isGroupImpl(u) && u.finalizationStatus === "Finalized";

/**
 * @internal
 */
export const isUnfinalizedGroupImpl = (u: unknown): u is AnyUnfinalized =>
  isGroupImpl(u) && u.finalizationStatus === "Unfinalized";

/**
 * Build the runtime tag for a `GroupImpl` service. The finalization status is
 * embedded in the tag string so that `Unfinalized` and `Finalized` are distinct
 * services at runtime; consumers of a finalized layer (the server's
 * `RegisteredFunctions.buildForGroup` and the CLI's `validateImpl`) retrieve
 * the typed `Finalized` service directly rather than scanning the context.
 *
 * The tag is keyed only by finalization status—no group path—because each
 * group's impl layer is built in its own isolated scope
 * (`buildForGroup`/`validateImpl` each provide a fresh `Registry`), so at most
 * one `GroupImpl` service of each status exists per build.
 *
 * @internal
 */
export const GroupImpl = <FinalizationStatus_ extends FinalizationStatus>({
  finalizationStatus,
}: {
  finalizationStatus: FinalizationStatus_;
}) =>
  Context.Service<GroupImpl<FinalizationStatus_>>(
    `@confect/server/GroupImpl/${finalizationStatus}`,
  );

/**
 * Begin a group's implementation layer, requiring its functions and middleware.
 *
 * @category Layers
 *
 * @param _databaseSchema - Generated runtime schema; no schema thunk is
 *   evaluated.
 * @param _group - Group spec whose implementations must be supplied.
 *
 * @returns An unfinalized layer. Provide FunctionImpl/MiddlewareImpl layers
 *   with Layer.provide, then pass it to finalize and default-export the result
 *   from the matching .impl.ts module.
 */
export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Group extends GroupSpec.AnyWithProps,
>(
  _databaseSchema: DatabaseSchema_,
  _group: Group &
    MiddlewareSpec.ValidateImplRequires<
      GroupSpec.Functions<Group>,
      GroupSpec.MiddlewareSpecs<Group>
    >,
): Layer.Layer<
  GroupImpl<"Unfinalized">,
  never,
  FunctionImpl.FromGroupSpec<Group> | MiddlewareImpl.FromGroupSpec<Group>
> =>
  Layer.succeed(
    GroupImpl<"Unfinalized">({ finalizationStatus: "Unfinalized" }),
    {
      [TypeId]: TypeId,
      finalizationStatus: "Unfinalized" as const,
      registeredFunctionNames: [],
      registeredMiddlewareKeys: [],
    },
  ) as Layer.Layer<
    GroupImpl<"Unfinalized">,
    never,
    FunctionImpl.FromGroupSpec<Group> | MiddlewareImpl.FromGroupSpec<Group>
  >;

const findUnfinalizedGroupImpl = <S>(
  context: Context.Context<S>,
): Option.Option<AnyUnfinalized> =>
  Array.findFirst(context.mapUnsafe.values(), isUnfinalizedGroupImpl);

/**
 * Finish a group after all function and middleware implementations are
 * supplied.
 *
 * @category Combinators
 *
 * @param group - An unfinalized layer with no remaining requirements. Missing
 *   implementations are rejected by the parameter's type.
 *
 * @returns A finalized layer accepted as the .impl.ts default export. Building
 *   an invalid layer without its unfinalized group service dies with a defect.
 */
export const finalize = (
  group: Layer.Layer<GroupImpl<"Unfinalized">>,
): Layer.Layer<GroupImpl<"Finalized">> =>
  Layer.flatMap(group, (context): Layer.Layer<GroupImpl<"Finalized">> =>
    findUnfinalizedGroupImpl(context).pipe(
      Option.match({
        onNone: () =>
          Layer.effect(
            GroupImpl<"Finalized">({ finalizationStatus: "Finalized" }),
            Effect.die(
              new Error(
                "GroupImpl.finalize: no Unfinalized GroupImpl service was found in the layer's context.",
              ),
            ),
          ),
        onSome: () =>
          Layer.effect(
            GroupImpl<"Finalized">({ finalizationStatus: "Finalized" }),
            Effect.gen(function* () {
              const registry = yield* Registry.Registry;
              const items = yield* Ref.get(registry);
              return {
                [TypeId]: TypeId,
                finalizationStatus: "Finalized" as const,
                registeredFunctionNames: RegistryItems.functionNames(items),
                registeredMiddlewareKeys: RegistryItems.middlewareKeys(items),
              };
            }),
          ),
      }),
    ),
  );

/**
 * @internal
 */
export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  | FunctionImpl.FromGroupSpec<Group>
  | MiddlewareImpl.FromGroupSpec<Group>;
