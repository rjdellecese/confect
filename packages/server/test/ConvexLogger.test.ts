import * as ConvexLogger from "@confect/server/ConvexLogger";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as References from "effect/References";
import * as TestConsole from "effect/testing/TestConsole";
import { vi } from "vitest";

const makeConsole = Effect.map(TestConsole.make, (console) => ({
  ...console,
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

describe("ConvexLogger", () => {
  it.effect.each([
    { name: "logTrace", log: Effect.logTrace, level: "TRACE", method: "debug" },
    { name: "logDebug", log: Effect.logDebug, level: "DEBUG", method: "debug" },
    { name: "log", log: Effect.log, level: "INFO", method: "info" },
    { name: "logInfo", log: Effect.logInfo, level: "INFO", method: "info" },
    {
      name: "logWarning",
      log: Effect.logWarning,
      level: "WARN",
      method: "warn",
    },
    { name: "logError", log: Effect.logError, level: "ERROR", method: "error" },
    { name: "logFatal", log: Effect.logFatal, level: "FATAL", method: "error" },
  ] as const)(
    "routes $name to console.$method at $level",
    ({ log, level, method }) =>
      Effect.gen(function* () {
        const console = yield* makeConsole;
        yield* log("message").pipe(
          Effect.provide(Logger.layer([ConvexLogger.logger])),
          Effect.provideService(Console.Console, console),
          Effect.provideService(References.MinimumLogLevel, "Trace"),
        );

        expect(console[method]).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ level, message: "message" }),
        );
        expect([
          ...console.debug.mock.calls,
          ...console.info.mock.calls,
          ...console.warn.mock.calls,
          ...console.error.mock.calls,
        ]).toHaveLength(1);
        expect(console.log).not.toHaveBeenCalled();
        expect(console.trace).not.toHaveBeenCalled();
      }),
  );

  it.effect("preserves messages, causes, annotations, and log spans", () =>
    Effect.gen(function* () {
      const console = yield* makeConsole;
      const details = { attempt: 2 };
      yield* Effect.logError("failed", details, Cause.fail("unavailable")).pipe(
        Effect.annotateLogs("operation", "read"),
        Effect.withLogSpan("request"),
        Effect.provide(Logger.layer([ConvexLogger.logger])),
        Effect.provideService(Console.Console, console),
      );

      expect(console.error).toHaveBeenCalledExactlyOnceWith({
        level: "ERROR",
        message: ["failed", details],
        cause: expect.stringContaining("unavailable"),
        annotations: { operation: "read" },
        spans: { request: expect.any(Number) },
        timestamp: expect.any(String),
        fiberId: expect.any(String),
      });
      expect(details).toEqual({ attempt: 2 });
    }),
  );

  it.effect(
    "replaces only the default sink and leaves its inputs unchanged",
    () =>
      Effect.gen(function* () {
        const custom = Logger.make(() => undefined);
        const loggers = new Set([
          Logger.defaultLogger,
          Logger.tracerLogger,
          custom,
        ]);
        const context = yield* Layer.build(ConvexLogger.layer).pipe(
          Effect.provideService(Logger.CurrentLoggers, loggers),
        );
        expect(Context.get(context, Logger.CurrentLoggers)).toEqual(
          new Set([ConvexLogger.logger, Logger.tracerLogger, custom]),
        );
        expect(loggers).toEqual(
          new Set([Logger.defaultLogger, Logger.tracerLogger, custom]),
        );
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    { name: "custom-only", loggers: new Set([Logger.make(() => undefined)]) },
    { name: "disabled", loggers: new Set<Logger.Logger<unknown, void>>() },
  ])("does not add a console sink to $name logging", ({ loggers }) =>
    Effect.gen(function* () {
      const context = yield* Layer.build(ConvexLogger.layer).pipe(
        Effect.provideService(Logger.CurrentLoggers, loggers),
      );
      expect(Context.get(context, Logger.CurrentLoggers)).toEqual(loggers);
    }).pipe(Effect.scoped),
  );
});
