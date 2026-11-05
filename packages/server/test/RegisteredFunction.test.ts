import * as RecordEffect from "effect/Record";
import { UnsupportedSchemaTypeError } from "@confect/core/SchemaToValidator";
import { ConvexError, v } from "convex/values";
import * as RegisteredFunction from "@confect/server/RegisteredFunction";
import { describe, expect, it } from "@effect/vitest";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import * as Scheduler from "effect/Scheduler";
import * as TestConsole from "effect/testing/TestConsole";
import { vi } from "vitest";

describe("runHandlerPromise", () => {
  it.effect("encodes declared errors without wrapping the ConvexError", () =>
    Effect.promise(() =>
      expect(
        RegisteredFunction.runHandlerPromise({
          effect: Effect.fail({ count: 2 }),
          errorSchema: Schema.Struct({ count: Schema.FiniteFromString }),
        }),
      ).rejects.toEqual(new ConvexError({ count: "2" })),
    ),
  );

  it.effect("does not expose undeclared errors as ConvexError data", () =>
    Effect.promise(() =>
      expect(
        RegisteredFunction.runHandlerPromise({
          effect: Effect.fail({ secret: "server-only" }),
          errorSchema: undefined,
        }),
      ).rejects.not.toBeInstanceOf(ConvexError),
    ),
  );

  it.effect("does not expose an error that its schema cannot encode", () =>
    Effect.promise(() =>
      expect(
        RegisteredFunction.runHandlerPromise({
          effect: Effect.fail({ count: "not a number" }),
          errorSchema: Schema.Struct({ count: Schema.FiniteFromString }),
        }),
      ).rejects.not.toBeInstanceOf(ConvexError),
    ),
  );

  it.effect("rethrows a ConvexError defect with its original identity", () => {
    const defect = new ConvexError({ message: "InvalidCursor" });
    return Effect.promise(() =>
      expect(
        RegisteredFunction.runHandlerPromise({
          effect: Effect.die(defect),
          errorSchema: undefined,
        }),
      ).rejects.toBe(defect),
    );
  });

  it.effect("starts a fresh fiber with each invocation's root scheduler", () =>
    Effect.gen(function* () {
      const firstScheduler = new Scheduler.MixedScheduler("sync");
      const secondScheduler = new Scheduler.MixedScheduler("sync");
      const inspect = Effect.withFiber((fiber) =>
        Effect.succeed({
          id: fiber.id,
          scheduler: fiber.getRef(Scheduler.Scheduler),
        }),
      );
      const [first, second] = yield* Effect.promise(() =>
        Promise.all([
          RegisteredFunction.runHandlerPromise({
            effect: inspect,
            errorSchema: undefined,
            runOptions: { scheduler: firstScheduler },
          }),
          RegisteredFunction.runHandlerPromise({
            effect: inspect,
            errorSchema: undefined,
            runOptions: { scheduler: secondScheduler },
          }),
        ]),
      );
      expect(first.id).not.toBe(second.id);
      expect(first.scheduler).toBe(firstScheduler);
      expect(second.scheduler).toBe(secondScheduler);
    }),
  );

  it.effect("keeps the captured console across overlapping invocations", () =>
    Effect.gen(function* () {
      const original = globalThis.console;
      const first = { ...original, info: vi.fn() };
      const second = { ...original, info: vi.fn() };
      const release = yield* Deferred.make<void>();
      yield* Effect.promise(() => {
        globalThis.console = first;
        const firstResult = RegisteredFunction.runHandlerPromise({
          errorSchema: undefined,
          effect: release.pipe(
            Deferred.await,
            Effect.andThen(Effect.log("first")),
          ),
        });
        globalThis.console = second;
        const secondResult = RegisteredFunction.runHandlerPromise({
          errorSchema: undefined,
          effect: Effect.log("second"),
        }).finally(() => Deferred.doneUnsafe(release, Effect.void));
        return Promise.all([firstResult, secondResult]).finally(() => {
          globalThis.console = original;
        });
      });
      expect(first.info).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: "first" }),
      );
      expect(second.info).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: "second" }),
      );
    }),
  );

  it.effect(
    "binds each invocation's console even after Effect caches a default",
    () =>
      Effect.gen(function* () {
        const original = globalThis.console;
        Context.get(Context.empty(), Console.Console);
        const first = { ...original, info: vi.fn(), log: vi.fn() };
        const second = { ...original, info: vi.fn(), log: vi.fn() };
        yield* Effect.promise(() => {
          globalThis.console = first;
          return RegisteredFunction.runHandlerPromise({
            errorSchema: undefined,
            effect: Effect.log("first"),
          })
            .then(() => {
              globalThis.console = second;
              return RegisteredFunction.runHandlerPromise({
                errorSchema: undefined,
                effect: Effect.log("second"),
              });
            })
            .finally(() => {
              globalThis.console = original;
            });
        });
        expect(first.info).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ message: "first" }),
        );
        expect(second.info).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ message: "second" }),
        );
        expect(first.log).not.toHaveBeenCalled();
        expect(second.log).not.toHaveBeenCalled();
      }),
  );

  it.effect(
    "keeps Info filtering and tracer logging while allowing handler overrides",
    () =>
      Effect.gen(function* () {
        const console = {
          ...(yield* TestConsole.make),
          debug: vi.fn(),
          info: vi.fn(),
        };
        const loggers = yield* Effect.promise(() =>
          RegisteredFunction.runHandlerPromise({
            errorSchema: undefined,
            effect: Effect.gen(function* () {
              yield* Effect.logTrace("hidden trace");
              yield* Effect.logDebug("hidden debug");
              yield* Effect.logInfo("visible");
              const MinimumLogLevelResult = yield* References.MinimumLogLevel;
              expect(MinimumLogLevelResult).toBe("Info");
              return yield* Logger.CurrentLoggers;
            }).pipe(Effect.provideService(Console.Console, console)),
          }),
        );
        expect(loggers.has(Logger.tracerLogger)).toBe(true);
        expect(console.debug).not.toHaveBeenCalled();
        expect(console.info).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ message: "visible" }),
        );

        const custom = vi.fn();
        yield* Effect.promise(() =>
          RegisteredFunction.runHandlerPromise({
            errorSchema: undefined,
            effect: Effect.logInfo("custom").pipe(
              Effect.provideService(
                Logger.CurrentLoggers,
                new Set([Logger.make(custom)]),
              ),
              Effect.provideService(Console.Console, console),
            ),
          }),
        );
        expect(custom).toHaveBeenCalledOnce();
        expect(console.info).toHaveBeenCalledOnce();
      }),
  );
});

describe("toConvexDefinition", () => {
  it("materializes each validator independently into a stable data property", () => {
    const args = { text: v.string() };
    const returns = v.array(v.string());
    const prepared = {
      args: vi.fn(() => args),
      returns: vi.fn(() => returns),
      handler: (text: string) => [text],
    };
    const definition = RegisteredFunction.toConvexDefinition(prepared);

    expect(definition.handler).toBe(prepared.handler);
    expect(RecordEffect.keys(definition)).toEqual([
      "handler",
      "args",
      "returns",
    ]);
    expect(prepared.args).not.toHaveBeenCalled();
    expect(prepared.returns).not.toHaveBeenCalled();

    expect(definition.returns).toBe(returns);
    expect(definition.returns).toBe(returns);
    expect(prepared.returns).toHaveBeenCalledOnce();
    expect(prepared.args).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(definition, "returns")).toEqual({
      value: returns,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    expect(definition.args).toBe(args);
    expect(definition.args).toBe(args);
    expect(prepared.args).toHaveBeenCalledOnce();
    expect(Object.getOwnPropertyDescriptor(definition, "args")).toEqual({
      value: args,
      writable: false,
      enumerable: true,
      configurable: false,
    });
    expect(RecordEffect.keys(prepared)).toEqual(["args", "returns", "handler"]);
    expect(prepared.args).toBeTypeOf("function");
    expect(prepared.returns).toBeTypeOf("function");
  });

  it("propagates a compiler failure only when its validator is requested", () => {
    const failure = UnsupportedSchemaTypeError.make({ schemaType: "Symbol" });
    const prepared = {
      args: vi.fn(() => {
        throw failure;
      }),
      returns: vi.fn(() => v.null()),
      handler: () => null,
    };
    const definition = RegisteredFunction.toConvexDefinition(prepared);

    expect(prepared.args).not.toHaveBeenCalled();
    expect(definition.returns.kind).toBe("null");
    expect(() => definition.args).toThrow(failure);
    expect(prepared.args).toHaveBeenCalledOnce();
    expect(prepared.returns).toHaveBeenCalledOnce();
    expect(prepared.args).toBeTypeOf("function");
  });
});
