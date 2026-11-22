import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

declare const process: { env: Record<string, string | undefined> };

/**
 * Creates an Effect configuration provider that looks up Convex environment
 * variables by exact key. Confect already supplies it to function handlers and
 * HTTP routes.
 *
 * **Details**
 *
 * The provider joins path segments with `_`, so a nested path such as
 * `DATABASE`, `HOST` reads `DATABASE_HOST`. An empty string counts as missing,
 * allowing `Config.withDefault` and `Config.option` to recover.
 *
 * **Gotchas**
 *
 * Convex does not expose an enumerable `process.env`. Configuration that needs
 * to discover child keys cannot use this provider.
 *
 * @category Constructors
 *
 * @returns A provider that resolves exact configuration paths against
 *   `process.env`.
 */
export const make = (): ConfigProvider.ConfigProvider =>
  ConfigProvider.make((path) => {
    const value = process.env[pipe(path, Array.map(String), Array.join("_"))];

    return Effect.succeed(
      value === undefined || value === ""
        ? undefined
        : ConfigProvider.makeValue(value),
    );
  });

/**
 * Installs the Convex-aware `ConfigProvider` as the ambient provider.
 *
 * @internal
 */
export const layer: Layer.Layer<never> = Layer.succeed(
  ConfigProvider.ConfigProvider,
  make(),
);
