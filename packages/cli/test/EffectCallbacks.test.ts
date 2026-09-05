import type { BuildError, BundlerError } from "@confect/cli/BuildError";
import type * as CodegenError from "@confect/cli/CodegenError";
import type { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import type { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import type * as FunctionPaths from "@confect/cli/FunctionPaths";
import type * as GroupPath from "@confect/cli/GroupPath";
import type * as GroupPaths from "@confect/cli/GroupPaths";
import type { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as TableModule from "@confect/cli/TableModule";
import { codegenHandler } from "@confect/cli/confect/codegen";
import { dev } from "@confect/cli/confect/dev";
import { generateFunctions, writeGroups } from "@confect/cli/utils";
import type { Spec } from "@confect/core";
import { expect, expectTypeOf, it } from "@effect/vitest";
import type { NoSuchElementError } from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Command from "effect/unstable/cli/Command";

type FileServices = FileSystem.FileSystem | Path.Path;
type GenerationServices = FileServices | ConfectDirectory | ConvexDirectory;

it("preserves actual workflow inputs and inferred result, error, and service types", () => {
  expectTypeOf(TableModule.discover).toEqualTypeOf<
    Effect.Effect<
      Array<{ relativePath: string; tableName: string }>,
      | CodegenError.DuplicateTableNameError
      | CodegenError.InvalidTableFilenameError
      | PlatformError,
      FileServices | ConfectDirectory
    >
  >();
  expectTypeOf(TableModule.validate).parameters.toEqualTypeOf<
    [tableModules: ReadonlyArray<TableModule.TableModule>]
  >();
  expectTypeOf(TableModule.validate).returns.toEqualTypeOf<
    Effect.Effect<
      void,
      BuildError | CodegenError.InvalidTableDefaultExportError,
      FileServices | ConfectDirectory
    >
  >();
  expectTypeOf(writeGroups).parameters.toEqualTypeOf<
    [spec: Spec.AnyWithProps, groupPaths: GroupPaths.GroupPaths]
  >();
  expectTypeOf(writeGroups).returns.toEqualTypeOf<
    Effect.Effect<
      Array<void>,
      NoSuchElementError | PlatformError,
      GenerationServices
    >
  >();
  expectTypeOf(generateFunctions).parameters.toEqualTypeOf<
    [spec: Spec.AnyWithProps]
  >();
  expectTypeOf(generateFunctions).returns.toEqualTypeOf<
    Effect.Effect<
      FunctionPaths.FunctionPaths,
      | GroupPath.GroupModulePathIsNotATypeScriptFileError
      | NoSuchElementError
      | PlatformError,
      GenerationServices | ProjectRoot
    >
  >();
  expectTypeOf(codegenHandler).toEqualTypeOf<
    Effect.Effect<
      {
        functionPaths: FunctionPaths.FunctionPaths;
        anyWritesHappened: boolean;
      },
      | CodegenError.CodegenError
      | BundlerError
      | GroupPath.GroupModulePathIsNotATypeScriptFileError
      | NoSuchElementError
      | PlatformError,
      GenerationServices | ProjectRoot
    >
  >();
  expectTypeOf(dev).toEqualTypeOf<
    Command.Command<
      "dev",
      {},
      {},
      | BundlerError
      | GroupPath.GroupModulePathIsNotATypeScriptFileError
      | NoSuchElementError
      | PlatformError,
      GenerationServices | ProjectRoot
    >
  >();
});

class Prefix extends Context.Service<Prefix, string>()(
  "@confect/cli/test/EffectCallbacks.test/Prefix",
) {}

class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  relativePath: Schema.String,
}) {}

it.effect(
  "preserves typed callback arguments, indexes, and channels when passed directly",
  () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<ReadonlyArray<readonly [string, number]>>(
        [],
      );
      const visit = Effect.fnUntraced(function* (
        entry: TableModule.TableModule,
        index: number,
      ) {
        const prefix = yield* Prefix;
        yield* Ref.update(calls, (previous) => [
          ...previous,
          [entry.relativePath, index] as const,
        ]);
        if (entry.tableName === "rejected") {
          return yield* new Rejected({ relativePath: entry.relativePath });
        }
        return `${prefix}${entry.relativePath}:${index}`;
      });
      expectTypeOf(visit).parameters.toEqualTypeOf<
        [entry: TableModule.TableModule, index: number]
      >();
      expectTypeOf(visit).returns.toEqualTypeOf<
        Effect.Effect<string, Rejected, Prefix>
      >();
      expectTypeOf<{ tableName: string; relativePath: number }>().not.toExtend<
        Parameters<typeof visit>[0]
      >();

      const entries: ReadonlyArray<TableModule.TableModule> = [
        { tableName: "first", relativePath: "tables/first.ts" },
        { tableName: "second", relativePath: "tables/second.ts" },
      ];
      const visits = Effect.forEach(entries, visit);
      expectTypeOf(visits).toEqualTypeOf<
        Effect.Effect<Array<string>, Rejected, Prefix>
      >();
      expectTypeOf<typeof visits>().not.toExtend<
        Effect.Effect<Array<string>, Rejected>
      >();
      expect(yield* Ref.get(calls)).toEqual([]);
      const supplied = visits.pipe(Effect.provideService(Prefix, "./"));
      expectTypeOf(supplied).toEqualTypeOf<
        Effect.Effect<Array<string>, Rejected>
      >();
      expect(yield* supplied).toEqual([
        "./tables/first.ts:0",
        "./tables/second.ts:1",
      ]);
      expect(yield* Ref.get(calls)).toEqual([
        ["tables/first.ts", 0],
        ["tables/second.ts", 1],
      ]);

      const error = yield* Effect.forEach(
        [{ tableName: "rejected", relativePath: "tables/rejected.ts" }],
        visit,
      ).pipe(Effect.provideService(Prefix, "./"), Effect.flip);
      expect(error).toEqual(
        new Rejected({ relativePath: "tables/rejected.ts" }),
      );
    }),
);

it.effect("preserves generic callback specialization through forEach", () =>
  Effect.gen(function* () {
    const evaluate = Effect.fnUntraced(function* <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ): Effect.fn.Return<A, E, R> {
      return yield* effect;
    });
    const task: Effect.Effect<"value", Rejected, Prefix> = Effect.as(
      Prefix,
      "value" as const,
    );
    const result = Effect.forEach([task], evaluate);
    expectTypeOf(result).toEqualTypeOf<
      Effect.Effect<Array<"value">, Rejected, Prefix>
    >();
    expect(yield* result.pipe(Effect.provideService(Prefix, "unused"))).toEqual(
      ["value"],
    );
  }),
);
