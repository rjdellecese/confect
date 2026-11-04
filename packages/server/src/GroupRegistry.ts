import * as Record from "effect/Record";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Registry from "./Registry";
import type * as RegistryItems from "./RegistryItems";
import type * as GroupImpl from "./GroupImpl";
import * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";

export const make = (
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
) => {
  const registryItems = Effect.gen(function* () {
    const registry = yield* Registry.Registry;
    return yield* Ref.get(registry);
  }).pipe(
    Effect.provide(
      groupLayer.pipe(
        Layer.provideMerge(
          Layer.succeed(
            Registry.Registry,
            Ref.makeUnsafe<RegistryItems.RegistryItems>({}),
          ),
        ),
      ),
    ),
    Effect.runSync,
  );

  return partitionRegistryItems(registryItems);
};

const partitionRegistryItems = (registryItems: RegistryItems.RegistryItems) => {
  const middlewareRegistryItems = new Map<
    string,
    MiddlewareRegistryItem.MiddlewareRegistryItem
  >();
  const functionRegistryItems: Record<string, unknown> = {};
  for (const [key, value] of Record.toEntries(registryItems)) {
    if (MiddlewareRegistryItem.isMiddlewareRegistryItem(value)) {
      middlewareRegistryItems.set(value.middlewareSpec.key, value);
    } else {
      functionRegistryItems[key] = value;
    }
  }
  return { functionRegistryItems, middlewareRegistryItems };
};
