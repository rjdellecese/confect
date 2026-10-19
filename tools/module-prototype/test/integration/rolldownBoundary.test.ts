import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { rolldown, type InputOptions, type RolldownOutput } from "rolldown";
import { dev, scan } from "rolldown/experimental";

class NativeFailure extends Schema.TaggedError<NativeFailure>()(
  "RolldownBoundaryFailure",
  {
    operation: Schema.String,
    cause: Schema.Unknown,
  },
) {}

const call = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new NativeFailure({ operation, cause }),
  });

const virtual = (dependency: string) => {
  const events: string[] = [];
  const graph: { id: string; imports: readonly string[] }[] = [];
  const modules: Readonly<Record<string, string>> = {
    entry: 'import { value } from "dependency"; export const answer = value;',
    dependency: dependency,
  };
  const options: InputOptions = {
    input: "entry",
    tsconfig: false,
    plugins: [
      {
        name: "boundary-fixture",
        resolveId(id) {
          return Object.hasOwn(modules, id) ? id : null;
        },
        load(id) {
          events.push("load");
          return modules[id];
        },
        buildEnd() {
          events.push("buildEnd");
          for (const id of this.getModuleIds())
            graph.push({
              id,
              imports: this.getModuleInfo(id)?.importedIds ?? [],
            });
        },
        renderStart() {
          events.push("renderStart");
        },
        generateBundle() {
          events.push("generateBundle");
        },
      },
    ],
  };
  return { options, events, graph };
};

describe("Rolldown public validation boundary", () => {
  it.effect(
    "exposes a scan-only graph through plugin hooks without generating output",
    () =>
      Effect.gen(function* () {
        const fixture = virtual("export const value = 1;");
        yield* call("scan", () => scan(fixture.options).then(() => undefined));
        expect(fixture.events.filter((event) => event === "load")).toHaveLength(
          2,
        );
        expect(fixture.events).toContain("buildEnd");
        expect(fixture.events).not.toContain("renderStart");
        expect(fixture.events).not.toContain("generateBundle");
        expect(fixture.graph).toEqual(
          expect.arrayContaining([
            { id: "entry", imports: ["dependency"] },
            { id: "dependency", imports: [] },
          ]),
        );
        const before = [...fixture.events];
        const bundle = yield* Effect.acquireRelease(
          call("create", () => rolldown(fixture.options)),
          (value) => Effect.promise(() => value.close()),
        );
        expect(fixture.events).toEqual(before);
        const output = yield* call("generate", () =>
          bundle.generate({ format: "esm" }),
        );
        expect(output.output.length).toBeGreaterThan(0);
        expect(fixture.events).toContain("renderStart");
        expect(fixture.events).toContain("generateBundle");
      }).pipe(Effect.scoped),
  );

  it.effect("does not equate successful scanning with semantic readiness", () =>
    Effect.gen(function* () {
      const fixture = virtual("export const another = 1;");
      yield* call("scan", () => scan(fixture.options).then(() => undefined));
      expect(fixture.graph).toEqual(
        expect.arrayContaining([{ id: "entry", imports: ["dependency"] }]),
      );
      const bundle = yield* Effect.acquireRelease(
        call("create", () => rolldown(fixture.options)),
        (value) => Effect.promise(() => value.close()),
      );
      const generated = yield* call("generate", () =>
        bundle.generate({ format: "esm" }),
      ).pipe(Effect.result);
      assert(Result.isFailure(generated));
      expect(String(generated.failure.cause)).toMatch(
        /not exported|MISSING_EXPORT/,
      );
    }).pipe(Effect.scoped),
  );

  it.effect(
    "manually refreshes without watchers but still generates when disk writes are skipped",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.js");
        const directory = path.join(root, "output");
        yield* fs.writeFileString(entry, "export const value = 1;");
        const outputs = yield* Queue.unbounded<RolldownOutput | Error>();
        const services = yield* Effect.context<never>();
        let renders = 0;
        let generates = 0;
        const engine = yield* Effect.acquireRelease(
          call("dev", () =>
            dev(
              {
                input: entry,
                tsconfig: false,
                plugins: [
                  {
                    name: "count-generation",
                    renderStart() {
                      renders++;
                    },
                    generateBundle() {
                      generates++;
                    },
                  },
                ],
              },
              { format: "esm", dir: directory },
              {
                watch: { enabled: false, skipWrite: true },
                onOutput(result) {
                  Effect.runSyncWith(services)(Queue.offer(outputs, result));
                },
              },
            ),
          ),
          (value) => Effect.promise(() => value.close()),
        );
        yield* call("run", () => engine.run());
        const first = yield* Queue.take(outputs);
        assert(!(first instanceof Error));
        yield* call("finish", () => engine.ensureCurrentBuildFinish());
        expect(renders).toBe(1);
        expect(generates).toBe(1);
        yield* fs.writeFileString(entry, "export const value = 2;");
        engine.triggerFullBuild();
        const second = yield* Queue.take(outputs);
        assert(!(second instanceof Error));
        yield* call("finish", () => engine.ensureCurrentBuildFinish());
        expect(renders).toBe(2);
        expect(generates).toBe(2);
        expect(
          second.output
            .filter((output) => output.type === "chunk")
            .map((output) => output.code)
            .join("\n"),
        ).toContain("= 2");
        expect(engine.moduleGraph.getModuleIds()).toContain(entry);
        expect(yield* fs.exists(directory)).toBe(false);
      }).pipe(
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.provide(NodeServices.layer),
      ),
  );
});
