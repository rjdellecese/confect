import * as ConfigProvider from "effect/ConfigProvider";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";

declare const process: { env: Record<string, string | undefined> };

/**
 * A `ConfigProvider` that reads configuration directly from `process.env` by
 * exact path lookup.
 *
 * The Convex runtime exposes `process.env` for direct key access but does not
 * make it enumerable, so the built-in `ConfigProvider.fromEnv` (which builds a
 * trie over the environment to resolve and enumerate config paths) cannot be
 * used. This provider resolves each requested path to a single environment
 * variable, joining the path segments with `"_"` to match the key convention
 * `fromEnv` uses.
 */
export const make = (): ConfigProvider.ConfigProvider =>
  ConfigProvider.make((path) => {
    const value = process.env[path.map(String).join("_")];

    return Effect.succeed(
      value === undefined ? undefined : ConfigProvider.makeValue(value),
    );
  });

/**
 * Installs the Convex-aware `ConfigProvider` as the ambient provider.
 */
export const layer: Layer.Layer<never> = Layer.succeed(
  ConfigProvider.ConfigProvider,
  make(),
);
