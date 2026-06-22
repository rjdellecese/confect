import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";

declare const process: { env: Record<string, string | undefined> };

/**
 * A `ConfigProvider` that reads configuration directly from `process.env` by
 * exact path lookup.
 *
 * The Convex runtime exposes `process.env` for direct key access but does not
 * make it enumerable, so the built-in `ConfigProvider.fromEnv` (which walks the
 * environment to build the config tree) cannot be used. This provider resolves
 * each requested path to a single environment variable instead.
 */
export const make = (options?: {
  readonly pathDelim?: string;
}): ConfigProvider.ConfigProvider => {
  const pathDelim = options?.pathDelim ?? "_";

  return ConfigProvider.make((path) => {
    const value = process.env[path.join(pathDelim)];

    return Effect.succeed(
      value === undefined ? undefined : ConfigProvider.makeValue(value),
    );
  });
};
