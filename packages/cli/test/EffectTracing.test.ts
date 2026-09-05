import * as Bundler from "@confect/cli/Bundler";
import * as CodegenError from "@confect/cli/CodegenError";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import { codegenHandler } from "@confect/cli/confect/codegen";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";

const makeRecordingTracer = () => {
  const spans: Array<Tracer.Span> = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, tracer };
};

const makeProject = Effect.fnUntraced(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    directory: import.meta.dirname,
    prefix: "tracing-",
  });
  const confect = path.join(root, "confect");
  const convex = path.join(root, "convex");
  yield* fs.makeDirectory(confect);
  yield* fs.makeDirectory(convex);
  yield* fs.writeFileString(
    path.join(confect, "notes.spec.ts"),
    'import { GroupSpec } from "@confect/core";\nexport default GroupSpec.make();\n',
  );
  yield* fs.writeFileString(
    path.join(confect, "notes.impl.ts"),
    [
      'import { GroupImpl } from "@confect/server";',
      'import databaseSchema from "./_generated/schema";',
      'import notes from "./notes.spec";',
      "export default GroupImpl.make(databaseSchema, notes).pipe(GroupImpl.finalize);",
      "",
    ].join("\n"),
  );
  yield* fs.writeFileString(
    path.join(convex, "convex.config.ts"),
    'import { defineApp } from "convex/server";\nexport default defineApp();\n',
  );
  return {
    confect,
    convex,
    directories: Layer.mergeAll(
      Layer.succeed(ProjectRoot, { get: Effect.succeed(root) }),
      Layer.succeed(ConfectDirectory, { get: Effect.succeed(confect) }),
      Layer.succeed(ConvexDirectory, { get: Effect.succeed(convex) }),
    ),
  };
});

layer(Layer.mergeAll(NodePath.layer, NodeFileSystem.layer))(
  "CLI operation tracing",
  (it) => {
    it.effect(
      "creates a fresh operation hierarchy for each codegen execution",
      () =>
        Effect.gen(function* () {
          const { directories } = yield* makeProject();
          const { spans, tracer } = makeRecordingTracer();
          const pass = codegenHandler.pipe(
            Effect.provide(directories),
            Effect.provideService(Tracer.Tracer, tracer),
          );

          expect(spans).toEqual([]);
          const first = yield* pass;
          const second = yield* pass;
          expect(first.anyWritesHappened).toBe(true);
          expect(second.anyWritesHappened).toBe(false);

          const passes = spans.filter((span) => span.name === "Cli.codegen");
          expect(passes).toHaveLength(2);
          expect(passes[0]).not.toBe(passes[1]);
          for (const name of [
            "LeafModule.validateSpec",
            "LeafModule.validateImpl",
            "ConvexConfig.discoverInstalledComponents",
          ]) {
            const operations = spans.filter((span) => span.name === name);
            expect(operations).toHaveLength(2);
            for (const operation of operations) {
              expect(passes).toContain(Option.getOrUndefined(operation.parent));
            }
          }
          const bundles = spans.filter(
            (span) => span.name === "Bundler.bundle",
          );
          expect(bundles.length).toBeGreaterThan(0);
          for (const bundle of bundles) {
            const parent = Option.getOrUndefined(bundle.parent);
            assert(parent?._tag === "Span");
            expect([
              "Cli.codegen",
              "LeafModule.validateSpec",
              "LeafModule.validateImpl",
              "ConvexConfig.discoverInstalledComponents",
            ]).toContain(parent.name);
          }
          for (const span of spans) {
            assert(span.status._tag === "Ended");
            expect(Exit.isSuccess(span.status.exit)).toBe(true);
          }
        }),
    );

    it.effect.each([
      { kind: "spec", name: "LeafModule.validateSpec" },
      { kind: "impl", name: "LeafModule.validateImpl" },
      { kind: "config", name: "ConvexConfig.discoverInstalledComponents" },
    ] as const)(
      "retains a failed $kind operation when the caller recovers",
      ({ kind, name }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const { confect, convex, directories } = yield* makeProject();
          const file =
            kind === "config"
              ? path.join(convex, "convex.config.ts")
              : path.join(confect, `notes.${kind}.ts`);
          yield* fs.writeFileString(file, "export default {};\n");
          const { spans, tracer } = makeRecordingTracer();

          const result = yield* codegenHandler.pipe(
            CodegenError.catchAndLog,
            Effect.provide(directories),
            Effect.provideService(Tracer.Tracer, tracer),
          );

          expect(Option.isNone(result)).toBe(true);
          for (const operationName of ["Cli.codegen", name]) {
            const span = spans.find(
              (candidate) => candidate.name === operationName,
            );
            assert(span !== undefined);
            assert(span.status._tag === "Ended");
            expect(Exit.isFailure(span.status.exit)).toBe(true);
          }
        }),
    );

    it.effect("defers bundling until execution and closes failure spans", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(directory, "entry.ts");
        const { spans, tracer } = makeRecordingTracer();
        const bundle = Bundler.bundle(entry).pipe(
          Effect.provideService(Tracer.Tracer, tracer),
        );

        expect(spans).toEqual([]);
        yield* fs.writeFileString(entry, "export default 42;\n");
        expect((yield* bundle).module.default).toBe(42);
        yield* fs.remove(entry);
        expect(Exit.isFailure(yield* Effect.exit(bundle))).toBe(true);
        expect(spans).toHaveLength(2);
        assert(spans[0]?.status._tag === "Ended");
        assert(spans[1]?.status._tag === "Ended");
        expect(Exit.isSuccess(spans[0].status.exit)).toBe(true);
        expect(Exit.isFailure(spans[1].status.exit)).toBe(true);
      }),
    );
  },
);
