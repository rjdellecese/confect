import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import { Context, Effect, Layer, Predicate, Ref } from "effect";
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

export interface AnyWithProps extends GroupImpl<string, FinalizationStatus> {}

export const isGroupImpl = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

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

/**
 * Walk a `RegistryItems` tree to the entries at `groupPath` and return the
 * names of the function-shaped leaves directly underneath.
 */
const collectFunctionNamesAtPath = (
  items: Registry.RegistryItems,
  groupPath: string,
): ReadonlyArray<string> => {
  let node: unknown = items;
  for (const segment of groupPath.split(".")) {
    if (node === null || typeof node !== "object" || !(segment in node)) {
      return [];
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (node === null || typeof node !== "object") {
    return [];
  }
  const names: string[] = [];
  for (const [name, value] of Object.entries(node)) {
    if (
      value !== null &&
      typeof value === "object" &&
      "functionSpec" in value
    ) {
      names.push(name);
    }
  }
  return names;
};

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
  Layer.flatMap(group, (context) => {
    let unfinalized: AnyWithProps | undefined;
    for (const value of context.unsafeMap.values() as Iterable<unknown>) {
      if (isGroupImpl(value) && value.finalizationStatus === "Unfinalized") {
        unfinalized = value;
        break;
      }
    }
    if (unfinalized === undefined) {
      throw new Error(
        "GroupImpl.finalize: no Unfinalized GroupImpl service was found in the layer's context.",
      );
    }
    const groupPath = unfinalized.groupPath as GroupPath_;
    return Layer.effect(
      GroupImpl<GroupPath_, "Finalized">({
        groupPath,
        finalizationStatus: "Finalized",
      }),
      Effect.gen(function* () {
        const registry = yield* Registry.Registry;
        const items = yield* Ref.get(registry);
        const registeredFunctionNames = collectFunctionNamesAtPath(
          items,
          groupPath,
        );
        return {
          [TypeId]: TypeId,
          groupPath,
          finalizationStatus: "Finalized" as const,
          registeredFunctionNames,
        };
      }),
    );
  });

export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionImpl.FromGroupSpec<Group>;
