import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as esbuild from "esbuild";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import * as Bundler from "@confect/cli/Bundler";
import * as Compilation from "@confect/cli/Compilation";
import * as CompilationSession from "@confect/cli/CompilationSession";
import * as CompiledModule from "@confect/cli/CompiledModule";
import * as Project from "./integration/Project";

vi.mock("esbuild", (importOriginal) =>
  importOriginal<typeof esbuild>().then((original) => ({
    ...original,
    context: vi.fn(original.context),
  })),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationSession",
  (it) => {
    it.effect.each(["Once", "Watch"] as const)(
      "guards project resolution metadata before the first compile in %s mode",
      (mode) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.provide(
            Effect.gen(function* () {
              const compiler = yield* Compilation.Service;
              expect(yield* compiler.topology).toEqual([]);
              yield* project.write(
                "package.json",
                '{"type":"module","name":"changed"}',
              );
              const result = yield* compiler.verify.pipe(Effect.result);
              assert(Result.isFailure(result));
              expect(result.failure.cause).toMatchObject({
                _tag: "CompilationRestartRequired",
              });
            }).pipe(Effect.provide(CompilationSession.layer(mode))),
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each(["Once", "Watch"] as const)(
      "ignores shadowed and unused configuration changes in %s mode",
      (mode) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const path = yield* Path.Path;
          yield* project.write("confect/tsconfig.json", "{}");
          yield* project.write("confect/entry.ts", "export default 42;");
          yield* project.provide(
            Effect.gen(function* () {
              const compiler = yield* Compilation.Service;
              const entry = path.join(project.root, "confect/entry.ts");
              const initial = yield* Bundler.compile(entry);
              assert(initial.origin);
              for (const file of ["tsconfig.json", "jsconfig.json"]) {
                yield* project.write(file, '{"extends":');
                yield* compiler.verify;
                const compiled = yield* Bundler.compile(entry);
                expect(compiled.origin).toMatchObject({
                  context: initial.origin.context,
                  roots: initial.origin.roots,
                });
                expect(
                  (yield* CompiledModule.namespace(compiled.url)).default,
                ).toBe(42);
                expect(Option.isNone(yield* compiler.restartRequired)).toBe(
                  true,
                );
              }
            }).pipe(Effect.provide(CompilationSession.layer(mode))),
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        mode: "Once",
        changedFile: "package.json",
        contents: '{"type":"module","name":"changed"}',
      },
      {
        mode: "Watch",
        changedFile: "package.json",
        contents: '{"type":"module","name":"changed"}',
      },
      {
        mode: "Once",
        changedFile: "tsconfig.json",
        contents: '{"compilerOptions":{"strict":true}}',
      },
      {
        mode: "Watch",
        changedFile: "tsconfig.json",
        contents: '{"compilerOptions":{"strict":true}}',
      },
      {
        mode: "Once",
        changedFile: "convex.json",
        contents: '{"functions":"backend"}',
      },
      {
        mode: "Watch",
        changedFile: "convex.json",
        contents: '{"functions":"backend"}',
      },
    ] as const)(
      "uses the same compiler policy in $mode mode and guards $changedFile",
      ({ mode, changedFile, contents }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const filesystemWatches = yield* Ref.make(0);
          const nativeWatches = yield* Ref.make(0);
          const context = vi.mocked(esbuild.context);
          const original = context.getMockImplementation();
          assert(original);
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          context.mockImplementation((options) =>
            original(options).then((native) => ({
              ...native,
              watch: () =>
                runPromise(
                  Ref.update(nativeWatches, (count) => count + 1).pipe(
                    Effect.andThen(Effect.promise(() => native.watch())),
                  ),
                ),
            })),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => context.mockImplementation(original)),
          );
          yield* project.write("value.ts", "export const value = 42;");
          yield* project.write(
            "confect/entry.ts",
            'export { value as default } from "../value";',
          );
          yield* project.provide(
            Effect.gen(function* () {
              const compiler = yield* Compilation.Service;
              expect(compiler.ownedDirectories).toEqual([
                path.join(project.root, "confect/_generated"),
                path.join(project.root, "convex"),
              ]);
              expect(compiler.authoredFiles).toEqual([
                path.join(project.root, "convex/convex.config.ts"),
                path.join(project.root, "convex/tsconfig.json"),
                path.join(project.root, "convex/package.json"),
              ]);
              const compiled = yield* Bundler.compile(
                path.join(project.root, "confect/entry.ts"),
              );
              expect(
                (yield* CompiledModule.namespace(compiled.url)).default,
              ).toBe(42);
              expect(compiled.origin).toBeDefined();
              expect(yield* Ref.get(nativeWatches)).toBe(
                mode === "Watch" ? 1 : 0,
              );
              if (mode === "Once")
                expect(yield* Ref.get(filesystemWatches)).toBe(0);
              else expect(yield* Ref.get(filesystemWatches)).toBeGreaterThan(0);
              yield* project.write(changedFile, contents);
              const changed = yield* Bundler.compile(
                path.join(project.root, "confect/entry.ts"),
              ).pipe(Effect.result);
              assert(Result.isFailure(changed));
              expect(changed.failure.cause).toMatchObject({
                _tag: "CompilationRestartRequired",
              });
            }).pipe(
              Effect.provide(CompilationSession.layer(mode)),
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                watch: (...args) =>
                  Stream.unwrap(
                    Ref.update(filesystemWatches, (count) => count + 1).pipe(
                      Effect.as(fs.watch(...args)),
                    ),
                  ),
              }),
            ),
          );
        }).pipe(Effect.scoped),
    );
  },
);
