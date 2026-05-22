import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import {
  Array,
  Context,
  Effect,
  Layer,
  Option,
  pipe,
  Predicate,
  Record,
  Ref,
  String,
} from "effect";
import type * as Api from "./Api";
import type * as FunctionImpl from "./FunctionImpl";
import { resolveGroupPathOrDie } from "./resolveGroupPath";

export const TypeId = "@confect/server/GroupImpl";
export type TypeId = typeof TypeId;

export type FinalizationStatus = "Unfinalized" | "Finalized";

export interface GroupImpl<
  GroupPath_ extends string,
  FinalizationStatus_ extends FinalizationStatus = "Unfinalized",
> {
  readonly [TypeId]: TypeId;
  readonly groupPath: GroupPath_;
  readonly finalizationStatus: FinalizationStatus_;
  /**
   * Names of every function registered into this group's layer scope by
   * `FunctionImpl.make`. Authoritative only when `finalizationStatus` is
   * `"Finalized"`; the `"Unfinalized"` value is set to `[]` at `make`-time
   * since the list is only known once `finalize` snapshots the registry.
   */
  readonly registeredFunctionNames: ReadonlyArray<string>;
}

export interface Any extends GroupImpl<string, FinalizationStatus> {}

export const isGroupImpl = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

export interface AnyFinalized extends GroupImpl<string, "Finalized"> {}
export interface AnyUnfinalized extends GroupImpl<string, "Unfinalized"> {}

export const isFinalized = (u: unknown): u is AnyFinalized =>
  isGroupImpl(u) && u.finalizationStatus === "Finalized";

export const isUnfinalized = (u: unknown): u is AnyUnfinalized =>
  isGroupImpl(u) && u.finalizationStatus === "Unfinalized";

/**
 * Build the runtime tag for a `GroupImpl` service. The finalization status is
 * embedded in the tag string so that `Unfinalized` and `Finalized` are distinct
 * services at runtime; consumers of a finalized layer (the server's
 * `RegisteredFunctions.buildForGroup` and the CLI's `implValidation`) retrieve
 * the typed `Finalized` service directly rather than scanning the context.
 */
export const GroupImpl = <
  GroupPath_ extends string,
  FinalizationStatus_ extends FinalizationStatus,
>({
  groupPath,
  finalizationStatus,
}: {
  groupPath: GroupPath_;
  finalizationStatus: FinalizationStatus_;
}) =>
  Context.GenericTag<GroupImpl<GroupPath_, FinalizationStatus_>>(
    `@confect/server/GroupImpl/${finalizationStatus}/${groupPath}`,
  );

export const make = <
  Api_ extends Api.AnyWithProps,
  Group extends GroupSpec.AnyWithProps,
>(
  api: Api_,
  group: Group,
): Layer.Layer<
  GroupImpl<string, "Unfinalized">,
  never,
  FunctionImpl.FromGroupSpec<Group>
> => {
  const groupPath = resolveGroupPathOrDie(api.spec, group);

  return Layer.succeed(
    GroupImpl<string, "Unfinalized">({
      groupPath,
      finalizationStatus: "Unfinalized",
    }),
    {
      [TypeId]: TypeId,
      groupPath,
      finalizationStatus: "Unfinalized" as const,
      registeredFunctionNames: [],
    },
  ) as Layer.Layer<
    GroupImpl<string, "Unfinalized">,
    never,
    FunctionImpl.FromGroupSpec<Group>
  >;
};

const isFunctionShaped = (value: unknown): boolean =>
  Predicate.isRecord(value) && "functionSpec" in value;

/**
 * Walk a `RegistryItems` tree to the entries at `groupPath` and return the
 * names of the function-shaped leaves directly underneath.
 */
const collectFunctionNamesAtPath = (
  items: Registry.RegistryItems,
  groupPath: string,
): ReadonlyArray<string> =>
  pipe(
    String.split(groupPath, "."),
    Array.reduce(Option.some<unknown>(items), (acc, segment) =>
      acc.pipe(
        Option.filter(Predicate.isRecord),
        Option.flatMap((node) =>
          segment in node ? Option.some(node[segment]) : Option.none(),
        ),
      ),
    ),
    Option.filter(Predicate.isRecord),
    Option.map(Record.toEntries),
    Option.map(
      Array.filterMap(([name, value]) =>
        isFunctionShaped(value) ? Option.some(name) : Option.none(),
      ),
    ),
    Option.getOrElse((): ReadonlyArray<string> => []),
  );

const findUnfinalizedGroupImpl = <S>(
  context: Context.Context<S>,
): Option.Option<Any> =>
  Array.findFirst(
    context.unsafeMap.values() as Iterable<unknown>,
    (value): value is Any =>
      isGroupImpl(value) && value.finalizationStatus === "Unfinalized",
  );

/**
 * Mark a `GroupImpl` layer as fully implemented. The parameter type defaults
 * `RIn = never`, so passing a layer that still requires any `FunctionImpl`
 * service produces a type error at the impl author's site. The codegen
 * boundary requires the resulting `"Finalized"` brand, so omitting this call
 * is also rejected downstream.
 *
 * As a side effect of finalization, the names of every `FunctionImpl` that
 * registered into this group's scope are snapshotted onto the produced
 * service value's `registeredFunctionNames` field, so consumers can verify
 * impl completeness against a `GroupSpec`'s expected functions without
 * having to inspect the `Registry` themselves.
 */
export const finalize = <GroupPath_ extends string>(
  group: Layer.Layer<GroupImpl<GroupPath_, "Unfinalized">>,
): Layer.Layer<GroupImpl<GroupPath_, "Finalized">> =>
  Layer.flatMap(
    group,
    (context): Layer.Layer<GroupImpl<GroupPath_, "Finalized">> =>
      findUnfinalizedGroupImpl(context).pipe(
        Option.match({
          onNone: () =>
            Layer.die(
              new Error(
                "GroupImpl.finalize: no Unfinalized GroupImpl service was found in the layer's context.",
              ),
            ),
          onSome: (unfinalized) => {
            const groupPath = unfinalized.groupPath as GroupPath_;
            return Layer.effect(
              GroupImpl<GroupPath_, "Finalized">({
                groupPath,
                finalizationStatus: "Finalized",
              }),
              Effect.gen(function* () {
                const registry = yield* Registry.Registry;
                const items = yield* Ref.get(registry);
                return {
                  [TypeId]: TypeId,
                  groupPath,
                  finalizationStatus: "Finalized" as const,
                  registeredFunctionNames: collectFunctionNamesAtPath(
                    items,
                    groupPath,
                  ),
                };
              }),
            );
          },
        }),
      ),
  );

export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionImpl.FromGroupSpec<Group>;
