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
  it.effect("routes every severity without stack-dumping Trace", () =>
    Effect.gen(function* () {
      const console = yield* makeConsole;
      yield* Effect.gen(function* () {
        yield* Effect.logTrace("trace");
        yield* Effect.logDebug("debug");
        yield* Effect.log("log");
        yield* Effect.logInfo("info");
        yield* Effect.logWarning("warning");
        yield* Effect.logError("error");
        yield* Effect.logFatal("fatal");
      }).pipe(
        Effect.provide(Logger.layer([ConvexLogger.logger])),
        Effect.provideService(Console.Console, console),
        Effect.provideService(References.MinimumLogLevel, "Trace"),
      );

      expect(console.debug.mock.calls).toEqual([
        [expect.objectContaining({ level: "TRACE", message: "trace" })],
        [expect.objectContaining({ level: "DEBUG", message: "debug" })],
      ]);
      expect(console.info.mock.calls).toEqual([
        [expect.objectContaining({ level: "INFO", message: "log" })],
        [expect.objectContaining({ level: "INFO", message: "info" })],
      ]);
      expect(console.warn.mock.calls).toEqual([
        [expect.objectContaining({ level: "WARN", message: "warning" })],
      ]);
      expect(console.error.mock.calls).toEqual([
        [expect.objectContaining({ level: "ERROR", message: "error" })],
        [expect.objectContaining({ level: "FATAL", message: "fatal" })],
      ]);
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

  it.effect(
    "does not add a console sink to custom-only or disabled logging",
    () =>
      Effect.gen(function* () {
        const custom = Logger.make(() => undefined);
        for (const loggers of [
          new Set([custom]),
          new Set<Logger.Logger<unknown, void>>(),
        ]) {
          const context = yield* Layer.build(ConvexLogger.layer).pipe(
            Effect.provideService(Logger.CurrentLoggers, loggers),
          );
          expect(Context.get(context, Logger.CurrentLoggers)).toEqual(loggers);
        }
      }).pipe(Effect.scoped),
  );
});
