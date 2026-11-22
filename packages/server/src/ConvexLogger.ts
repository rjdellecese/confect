import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Match from "effect/Match";

/**
 * Logger that sends structured Effect entries to Convex's console at the
 * corresponding severity, retaining the Effect level, cause, annotations,
 * spans, timestamp, and fiber ID.
 *
 * **Details**
 *
 * Trace and Debug use `console.debug`, Info uses `console.info`, Warn uses
 * `console.warn`, and Error and Fatal use `console.error`. All and None use
 * `console.log`.
 *
 * @category Logging
 */
export const logger: Logger.Logger<unknown, void> = Logger.make((options) => {
  const console = options.fiber.getRef(Console.Console);
  const output = Logger.formatStructured.log(options);
  return Match.value(options.logLevel).pipe(
    Match.whenOr("Trace", "Debug", () => console.debug(output)),
    Match.when("Info", () => console.info(output)),
    Match.when("Warn", () => console.warn(output)),
    Match.whenOr("Error", "Fatal", () => console.error(output)),
    Match.whenOr("All", "None", () => console.log(output)),
    Match.exhaustive,
  );
});

/**
 * Layer that replaces Effect's default console logger with {@link logger} for
 * Convex function handlers and HTTP routes. Confect installs it automatically
 * and leaves custom loggers, tracing, and the minimum log level unchanged.
 *
 * @category Layers
 */
export const layer: Layer.Layer<never> = Layer.effect(
  Logger.CurrentLoggers,
  Effect.map(
    Logger.CurrentLoggers,
    (loggers) =>
      new Set(
        Array.from(loggers, (current) =>
          current === Logger.defaultLogger ? logger : current,
        ),
      ),
  ),
);
