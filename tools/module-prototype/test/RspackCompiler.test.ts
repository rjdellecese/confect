import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { pathToFileURL } from "node:url";
import * as RspackCompiler from "../src/RspackCompiler.ts";
import * as Runner from "../src/Runner.ts";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";

const fixture = (files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(root, relative);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, contents);
    }
    return { fs, path, root, entry: path.join(root, "entry.ts") };
  });

const evaluate = (url: string) =>
  Runner.evaluateNative({
    _tag: "Native",
    url,
    exportName: "probe",
    invoke: true,
  });

describe("Rspack cold compiler prototype", () => {
  it.effect(
    "externalizes packages and requires restart after their resolution metadata changes",
    () =>
      Effect.gen(function* () {
        const { entry, fs, path, root } = yield* fixture({
          "entry.ts":
            'import value from "dependency"; export const probe = () => value;',
          "node_modules/dependency/package.json": '{"main":"./one.cjs"}',
          "node_modules/dependency/one.cjs": "module.exports = 1;",
          "node_modules/dependency/two.cjs": "module.exports = 2;",
        });
        const prepared = yield* RspackCompiler.compile(entry);
        expect(yield* evaluate(prepared.url)).toBe(1);
        expect(prepared.reusable).toBe(false);
        expect(prepared.external).toEqual([
          expect.objectContaining({
            importer: entry,
            physical: path.join(root, "node_modules/dependency/one.cjs"),
          }),
        ]);
        yield* fs.writeFileString(
          path.join(root, "node_modules/dependency/package.json"),
          '{"main":"./two.cjs"}',
        );
        const result = yield* prepared.validate.pipe(Effect.result);
        assert(Result.isFailure(result));
        assert(Schema.is(CompilationInputs.RestartRequired)(result.failure));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("preserves physical file scope for a suffixed module", () =>
    Effect.gen(function* () {
      const { entry, path, root } = yield* fixture({
        "entry.ts":
          'import { scope } from "./helper.ts?one"; export const probe = () => scope;',
        "helper.ts":
          "export const scope = [__filename, __dirname, import.meta.url];",
      });
      const prepared = yield* RspackCompiler.compile(entry);
      const helper = path.join(root, "helper.ts");
      expect(yield* evaluate(prepared.url)).toEqual([
        helper,
        root,
        pathToFileURL(helper).href,
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("rejects a missing export before exposing an artifact", () =>
    Effect.gen(function* () {
      const { entry } = yield* fixture({
        "entry.ts":
          'import { missing } from "./helper"; export const probe = missing;',
        "helper.ts": "export const other = 1;",
      });
      const result = yield* RspackCompiler.compile(entry).pipe(Effect.result);
      assert(Result.isFailure(result));
      assert(Schema.is(RspackCompiler.Failed)(result.failure));
      expect(result.failure.stage).toBe("build");
      expect(result.failure.message).toMatch(/missing|export/i);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("retains native module linking and fresh evaluation scopes", () =>
    Effect.gen(function* () {
      const { entry } = yield* fixture({
        "entry.ts":
          'import { increment } from "./helper"; export const probe = () => increment();',
        "helper.ts": "let value = 0; export const increment = () => ++value;",
      });
      const prepared = yield* RspackCompiler.compile(entry);
      expect(yield* evaluate(prepared.url)).toBe(1);
      expect(yield* evaluate(prepared.url)).toBe(1);
      yield* prepared.validate;
      expect(prepared.observations.length).toBeGreaterThan(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "uses the owned flattened configuration without nested rediscovery",
    () =>
      Effect.gen(function* () {
        const { entry } = yield* fixture({
          "tsconfig.json": '{"extends":"./base.json"}',
          "base.json":
            '{"compilerOptions":{"paths":{"@value":["./parent.ts"]}}}',
          "entry.ts":
            'import { value } from "./nested/helper"; export const probe = () => value;',
          "parent.ts": 'export const value = "owned";',
          "nested/tsconfig.json":
            '{"compilerOptions":{"paths":{"@value":["./other.ts"]}}}',
          "nested/other.ts": 'export const value = "rediscovered";',
          "nested/helper.ts": 'export { value } from "@value";',
        });
        const prepared = yield* RspackCompiler.compile(entry);
        expect(yield* evaluate(prepared.url)).toBe("owned");
        yield* prepared.validate;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "invalidates original input bytes even when only a comment changes",
    () =>
      Effect.gen(function* () {
        const { entry, fs } = yield* fixture({
          "entry.ts": "export const probe = () => 1; // first",
        });
        const prepared = yield* RspackCompiler.compile(entry);
        yield* fs.writeFileString(
          entry,
          "export const probe = () => 1; // other",
        );
        const validation = yield* prepared.validate.pipe(Effect.result);
        assert(Result.isFailure(validation));
        expect(yield* evaluate(prepared.url)).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
