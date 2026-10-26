import * as TypeScriptConfig from "@confect/cli/TypeScriptConfig";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as Result from "effect/Result";

const fixture = Effect.fnUntraced(function* (
  files: Record.ReadonlyRecord<string, string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  for (const [name, contents] of Record.toEntries(files)) {
    const file = path.join(root, name);
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, contents);
  }
  return { root, fs, path };
});

layer(NodeServices.layer)("TypeScriptConfig", (it) => {
  it.effect(
    "merges repeated inheritance branches in order without dropping shared aliases",
    () =>
      Effect.gen(function* () {
        const { root } = yield* fixture({
          "tsconfig.json": '{"extends":["./left.json","./right.json"]}',
          "left.json":
            '{"extends":"./shared.json","compilerOptions":{"paths":{"left":["./left.ts"]}}}',
          "right.json":
            '{"extends":"./shared.json","compilerOptions":{"strict":false}}',
          "shared.json":
            '{"compilerOptions":{"paths":{"shared":["./shared.ts"]}}}',
        });
        const selected = yield* TypeScriptConfig.discover(root);
        expect(Option.map(selected, (config) => config.aliases)).toEqual(
          Option.some(["shared"]),
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "retains aliases through cyclic inheritance without recursing forever",
    () =>
      Effect.gen(function* () {
        const { root } = yield* fixture({
          "tsconfig.json": '{"extends":"./base.json"}',
          "base.json":
            '{"extends":"./tsconfig.json","compilerOptions":{"paths":{"alias":["./value.ts"]}}}',
        });
        const selected = yield* TypeScriptConfig.discover(root);
        expect(Option.map(selected, (config) => config.aliases)).toEqual(
          Option.some(["alias"]),
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "selects the lexical nearest config without loading shadowed parents",
    () =>
      Effect.gen(function* () {
        const { root, fs, path } = yield* fixture({
          "tsconfig.json": '{"extends":',
          "physical/entry.ts": "export const value = 1;",
          "physical/tsconfig.json": '{"extends":',
          "lexical/tsconfig.json":
            '{"compilerOptions":{"paths":{"chosen":["./value.ts"]}}}',
          "lexical/jsconfig.json": '{"extends":',
        });
        yield* fs.symlink(
          path.join(root, "physical/entry.ts"),
          path.join(root, "lexical/entry.ts"),
        );
        const selected = yield* TypeScriptConfig.discover(
          path.join(root, "lexical"),
        );
        expect(selected).toEqual(
          Option.some({
            path: path.join(root, "lexical/tsconfig.json"),
            aliases: ["chosen"],
          }),
        );
        expect(TypeScriptConfig.buildOptions(selected)).toEqual({
          tsconfig: path.join(root, "lexical/tsconfig.json"),
        });
      }).pipe(Effect.scoped),
  );

  it.effect("preserves extends precedence and literal alias punctuation", () =>
    Effect.gen(function* () {
      const { root } = yield* fixture({
        "tsconfig.json": '{"extends":["./first.json","./second.json"]}',
        "first.json": '{"compilerOptions":{"paths":{"unused":["./wrong.ts"]}}}',
        "second.json":
          '{"compilerOptions":{"paths":{"@app.v1/*":["./*.ts"],"exact.name":["./value.ts"]}}}',
      });
      const selected = yield* TypeScriptConfig.discover(root);
      const patterns = TypeScriptConfig.aliasPatterns(selected);
      expect(
        patterns.some((pattern) => pattern.test("@app.v1/nested/value")),
      ).toBe(true);
      expect(
        patterns.some((pattern) => pattern.test("@appXv1/nested/value")),
      ).toBe(false);
      expect(patterns.some((pattern) => pattern.test("exact.name"))).toBe(true);
      expect(patterns.some((pattern) => pattern.test("exactXname"))).toBe(
        false,
      );
      expect(patterns.some((pattern) => pattern.test("unused"))).toBe(false);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "keeps absent configuration explicit and excludes the filesystem root",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const selected = yield* TypeScriptConfig.discover(
          path.parse(path.resolve(".")).root,
        );
        expect(selected).toEqual(Option.none());
        expect(TypeScriptConfig.buildOptions(selected)).toEqual({
          tsconfigRaw: {},
        });
        expect(TypeScriptConfig.aliasPatterns(selected)).toEqual([]);
      }),
  );

  it.effect(
    "reports a configuration directory through the bundler error channel",
    () =>
      Effect.gen(function* () {
        const { root } = yield* fixture({
          "tsconfig.json": "{}",
        });
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.remove(path.join(root, "tsconfig.json"));
        yield* fs.makeDirectory(path.join(root, "tsconfig.json"));
        const result = yield* TypeScriptConfig.discover(root).pipe(
          Effect.result,
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure._tag).toBe("BundlerError");
      }).pipe(Effect.scoped),
  );
});
