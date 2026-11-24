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
 * Service that distinguishes a group still awaiting implementations from one
 * ready for code generation. Build the group with {@link make}, provide its
 * implementation layers, and pass the result to {@link finalize}.
 *
 * @category Services
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
 * Creates an unfinalized layer for a group that requires the implementations of
 * its declared functions and attached middleware.
 *
 * **Details**
 *
 * Import `GroupImpl` from `_generated/server` and supply each implementation
 * using `Layer.provide`. If a function's middleware requires a service, the
 * group or function must have middleware that provides it.
 *
 * @category Layers
 *
 * @param _group - Group declaration from the sibling `.spec.ts` module.
 *
 * @returns An unfinalized layer to pass to {@link finalize} after supplying all
 *   implementations.
 */
export const make = <Group extends GroupSpec.AnyWithProps>(
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
 * Returns the finalized group layer to default-export from the group's
 * `.impl.ts` module.
 *
 * **Gotchas**
 *
 * The input type rejects groups with outstanding function or middleware
 * implementations. If a layer supplied outside that type contract builds a
 * context with no unfinalized group service, building the finalized layer dies
 * with a defect.
 *
 * @category Combinators
 *
 * @param group - Unfinalized group layer with no remaining requirements.
 *
 * @returns A layer whose finalized group records the registered function names
 *   and middleware keys.
 *
 * @see {@link make} to start a group implementation.
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
