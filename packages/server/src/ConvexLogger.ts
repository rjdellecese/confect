import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Match from "effect/Match";

/**
 * Writes structured Effect logs through Convex's severity-aware console
 * methods. Trace and Debug use `console.debug`, Info uses `console.info`, Warn
 * uses `console.warn`, and Error and Fatal use `console.error`. The payload
 * retains the original Effect level, cause, annotations, spans, timestamp, and
 * fiber ID.
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
 * Replaces Effect's default console logger without changing custom loggers,
 * tracing, or the minimum log level. Confect installs this layer automatically
 * for function handlers and HTTP routes.
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
