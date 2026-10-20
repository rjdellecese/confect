import { assert, expect, layer } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pathToFileURL } from "node:url";
import * as Compilation from "../../../../packages/cli/src/Compilation.ts";
import * as CompilationState from "../../../../packages/cli/src/CompilationState.ts";
import * as CompiledModule from "../../../../packages/cli/src/CompiledModule.ts";
import * as DevelopmentState from "../../../../packages/cli/src/DevelopmentState.ts";
import * as RspackCompiler from "../../src/RspackCompiler.ts";
import * as Runner from "../../src/Runner.ts";

const literal = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const a = path.join(root, "a.ts");
  const b = path.join(root, "b.ts");
  const shared = path.join(root, "shared.ts");
  yield* fs.writeFileString(
    a,
    'export { shared } from "./shared"; export const probe = 1; // alpha',
  );
  yield* fs.writeFileString(
    b,
    'export { shared } from "./shared"; export const probe = 2;',
  );
  yield* fs.writeFileString(shared, "export const shared = { value: 1 };");
  return { fs, path, root, a, b, shared, roots: [a, b] };
});

const evaluate = (url: string, invoke = false) =>
  Runner.evaluateNative({
    _tag: "Native",
    url,
    exportName: "probe",
    invoke,
  });

const consume = (
  prepared: Effect.Success<ReturnType<typeof RspackCompiler.compileEntries>>,
  receipt: CompilationState.Receipt,
  root: string,
  after = Effect.void,
) =>
  Effect.gen(function* () {
    yield* prepared.validate;
    const value = yield* evaluate(prepared.urls[root]);
    yield* after;
    yield* prepared.validate;
    const consumption = yield* CompiledModule.Consumption;
    yield* consumption.record({ ...receipt, roots: [root] });
    return value;
  });

layer(NodeServices.layer, { excludeTestServices: true })(
  "Rspack graph and production receipt accounting",
  (it) => {
    it.effect("retains lazy dependency edges in root input fingerprints", () =>
      Effect.gen(function* () {
        const data = yield* fixture;
        const lazy = data.path.join(data.root, "lazy.ts");
        yield* data.fs.writeFileString(
          data.a,
          'export const probe = async () => (await import("./lazy")).value;',
        );
        yield* data.fs.writeFileString(lazy, "export const value = 1;");
        const first = yield* RspackCompiler.compileEntries(data.roots);
        yield* data.fs.writeFileString(lazy, "export const value = 2;");
        const second = yield* RspackCompiler.compileEntries(data.roots);
        expect(
          CompilationState.changedRoots(
            first.fingerprints,
            second.fingerprints,
            data.roots,
          ),
        ).toEqual([data.a]);
        expect(yield* evaluate(second.urls[data.a], true)).toBe(2);
      }).pipe(Effect.scoped),
    );
    it.effect(
      "attributes comment-only and shared input changes through the native graph",
      () =>
        Effect.gen(function* () {
          const data = yield* fixture;
          const initial = yield* RspackCompiler.compileEntries(data.roots);
          const unchanged = yield* RspackCompiler.compileEntries(data.roots);
          expect(unchanged.fingerprints).toEqual(initial.fingerprints);
          yield* data.fs.writeFileString(
            data.a,
            'export { shared } from "./shared"; export const probe = 1; // other',
          );
          const edited = yield* RspackCompiler.compileEntries(data.roots);
          expect(
            CompilationState.changedRoots(
              initial.fingerprints,
              edited.fingerprints,
              data.roots,
            ),
          ).toEqual([data.a]);
          yield* data.fs.writeFileString(
            data.shared,
            "export const shared = { value: 2 };",
          );
          const shared = yield* RspackCompiler.compileEntries(data.roots);
          expect(
            CompilationState.changedRoots(
              edited.fingerprints,
              shared.fingerprints,
              data.roots,
            ),
          ).toEqual(data.roots);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves shared module identity across two entry artifacts in one evaluation",
      () =>
        Effect.gen(function* () {
          const data = yield* fixture;
          const prepared = yield* RspackCompiler.compileEntries(data.roots);
          const entry = data.path.join(
            yield* data.fs.makeTempDirectoryScoped(),
            "check.mjs",
          );
          yield* data.fs.writeFileString(
            entry,
            `export const probe = async () => (await import(${literal(prepared.urls[data.a])})).shared === (await import(${literal(prepared.urls[data.b])})).shared;`,
          );
          expect(yield* evaluate(pathToFileURL(entry).href, true)).toBe(true);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "acknowledges only consumed roots and leaves newer revisions pending",
      () =>
        Effect.gen(function* () {
          const data = yield* fixture;
          const first = yield* RspackCompiler.compileEntries(data.roots);
          const firstReceipt = { context: 1, revision: 1, roots: data.roots };
          const job = yield* Compilation.runJob(
            consume(first, firstReceipt, data.a),
          );
          assert(Exit.isSuccess(job.exit));
          expect(job.receipts).toEqual([
            { context: 1, revision: 1, roots: [data.a] },
          ]);
          const acknowledged = DevelopmentState.acknowledge(
            DevelopmentState.empty,
            job.receipts,
          );
          const event = {
            ...firstReceipt,
            affectedRoots: data.roots,
            errors: [],
            warnings: [],
          };
          expect(DevelopmentState.pendingRoots(acknowledged, event)).toEqual([
            data.b,
          ]);
          yield* data.fs.writeFileString(
            data.a,
            'export { shared } from "./shared"; export const probe = 3;',
          );
          const second = yield* RspackCompiler.compileEntries(data.roots);
          expect(
            DevelopmentState.pendingRoots(acknowledged, {
              ...event,
              revision: 2,
              affectedRoots: CompilationState.changedRoots(
                first.fingerprints,
                second.fingerprints,
                data.roots,
              ),
            }),
          ).toEqual([data.a]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "does not acknowledge an evaluation invalidated before consumption",
      () =>
        Effect.gen(function* () {
          const data = yield* fixture;
          const prepared = yield* RspackCompiler.compileEntries(data.roots);
          const job = yield* Compilation.runJob(
            consume(
              prepared,
              { context: 1, revision: 1, roots: data.roots },
              data.a,
              data.fs
                .writeFileString(data.b, "export const probe = 9;")
                .pipe(Effect.orDie),
            ),
          );
          assert(Exit.isFailure(job.exit));
          expect(job.receipts).toEqual([]);
        }).pipe(Effect.scoped),
    );
  },
);
