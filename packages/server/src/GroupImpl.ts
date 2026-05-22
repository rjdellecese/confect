import type * as GroupSpec from "@confect/core/GroupSpec";
import { Context, Layer, Predicate } from "effect";
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
}

export interface AnyWithProps extends GroupImpl<string, FinalizationStatus> {}

export const isGroupImpl = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * Build the runtime tag for a `GroupImpl` service. The finalization status is
 * embedded in the tag string so that `Unfinalized` and `Finalized` are distinct
 * services at runtime and can be told apart by walking the built `Context`.
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

/**
 * Runtime tag prefix shared by every `Unfinalized` `GroupImpl` service. The
 * CLI uses this prefix to detect impls that were never piped through
 * {@link finalize}.
 */
export const UNFINALIZED_TAG_PREFIX = "@confect/server/GroupImpl/Unfinalized/";

/**
 * Runtime tag prefix shared by every `Finalized` `GroupImpl` service. The CLI
 * uses this prefix to detect impls that have been correctly finalized.
 */
export const FINALIZED_TAG_PREFIX = "@confect/server/GroupImpl/Finalized/";

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
    },
  ) as Layer.Layer<
    GroupImpl<string, "Unfinalized">,
    never,
    FunctionImpl.FromGroupSpec<Group>
  >;
};

/**
 * Mark a `GroupImpl` layer as fully implemented. The parameter type defaults
 * `RIn = never`, so passing a layer that still requires any `FunctionImpl`
 * service produces a type error at the impl author's site. The codegen
 * boundary requires the resulting `"Finalized"` brand, so omitting this call
 * is also rejected downstream.
 */
export const finalize = <GroupPath_ extends string>(
  group: Layer.Layer<GroupImpl<GroupPath_, "Unfinalized">>,
): Layer.Layer<GroupImpl<GroupPath_, "Finalized">> =>
  Layer.map(group, (context) => {
    for (const [key, value] of context.unsafeMap as Map<string, unknown>) {
      if (key.startsWith(UNFINALIZED_TAG_PREFIX) && isGroupImpl(value)) {
        const groupPath = value.groupPath as GroupPath_;
        return Context.make(
          GroupImpl<GroupPath_, "Finalized">({
            groupPath,
            finalizationStatus: "Finalized",
          }),
          {
            [TypeId]: TypeId,
            groupPath,
            finalizationStatus: "Finalized" as const,
          },
        );
      }
    }
    throw new Error(
      "GroupImpl.finalize: no Unfinalized GroupImpl service was found in the layer's context.",
    );
  });

export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionImpl.FromGroupSpec<Group>;
