import { isDeepStrictEqual } from "node:util";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Bundler from "../../../../packages/cli/src/Bundler.ts";
import * as Compilation from "../../../../packages/cli/src/Compilation.ts";
import * as Compiler from "../../src/Compiler.ts";
import * as Runner from "../../src/Runner.ts";

interface Fixture {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly value?: unknown;
  readonly reject?: boolean;
  readonly invoke?: boolean;
}

const fixtures: ReadonlyArray<Fixture> = [
  {
    name: "owned inherited alias and live bindings",
    files: {
      "tsconfig.json": '{"extends":"./base.json"}',
      "base.json": '{"compilerOptions":{"paths":{"@helper":["./helper.ts"]}}}',
      "entry.ts":
        'import { value, bump } from "@helper"; export const probe = () => { bump(); return value; };',
      "helper.ts":
        "export let value = 1; export const bump = () => { value++; };",
    },
    value: 2,
    invoke: true,
  },
  {
    name: "cyclic live bindings",
    files: {
      "entry.ts":
        'import { read } from "./other"; export const value = 7; export const probe = () => read();',
      "other.ts":
        'import { value } from "./entry"; export const read = () => value;',
    },
    value: 7,
    invoke: true,
  },
  {
    name: "literal dynamic imports",
    files: {
      "entry.ts":
        'export const probe = async () => (await import("./lazy")).value;',
      "lazy.ts": "export const value = 23;",
    },
    value: 23,
    invoke: true,
  },
  {
    name: "importer-relative shared specifiers",
    files: {
      "entry.ts":
        'import { value as a } from "./left/index"; import { value as b } from "./right/index"; export const probe = a + b;',
      "left/index.ts": 'export { value } from "./shared";',
      "left/shared.ts": 'export const value = "left";',
      "right/index.ts": 'export { value } from "./shared";',
      "right/shared.ts": 'export const value = "right";',
    },
    value: "leftright",
  },
  {
    name: "JSON import attributes",
    files: {
      "entry.ts":
        'import value from "./value.json" with { type: "json" }; export const probe = value.answer;',
      "value.json": '{"answer":42}',
    },
    value: 42,
  },
  {
    name: "TypeScript attribute behavior matches the oracle",
    files: {
      "entry.ts":
        'import value from "./value.ts" with { type: "json" }; export const probe = value;',
      "value.ts": "export default 42;",
    },
    value: 42,
  },
  {
    name: "same file with distinct import attributes",
    files: {
      "entry.ts":
        'import data from "./value.json" with { type: "json" }; import text from "./value.json" with { type: "text" }; export const probe = [typeof data, typeof text];',
      "value.json": '{"answer":42}',
    },
    value: ["object", "string"],
  },
  {
    name: "unsupported import attributes are rejected",
    files: {
      "entry.ts":
        'import data from "./value.json" with { unknown: "unsupported" }; export const probe = data.answer;',
      "value.json": '{"answer":42}',
    },
    reject: true,
  },
  {
    name: "CommonJS default interop",
    files: {
      "entry.ts":
        'import value from "./value.cjs"; export const probe = value.answer;',
      "value.cjs": "module.exports = { answer: 42 };",
    },
    value: 42,
  },
  {
    name: "CommonJS named interop",
    files: {
      "entry.ts":
        'import { answer } from "./value.cjs"; export const probe = answer;',
      "value.cjs": "exports.answer = 42;",
    },
    value: 42,
  },
  {
    name: "authored require edges",
    files: {
      "entry.ts":
        'const value = require("./value.cjs"); export const probe = value.answer;',
      "value.cjs": "module.exports = { answer: 42 };",
    },
    value: 42,
  },
  {
    name: "Node builtin imports",
    files: {
      "entry.ts":
        'import { basename } from "node:path"; export const probe = basename("one/two");',
    },
    value: "two",
  },
  {
    name: "module suffix identity",
    files: {
      "entry.ts":
        'import a from "./value.ts?one"; import b from "./value.ts?two"; export const probe = [a, b];',
      "value.ts":
        "globalThis.__confectPrototypeSuffix = (globalThis.__confectPrototypeSuffix ?? 0) + 1; export default globalThis.__confectPrototypeSuffix;",
    },
    value: [1, 2],
  },
  {
    name: "authored file scope",
    files: {
      "entry.ts":
        'export const probe = typeof __filename === "string" && typeof __dirname === "string";',
    },
    value: true,
  },
  {
    name: "Confect schema laziness",
    files: {
      "entry.ts":
        'import * as FunctionSpec from "@confect/core/FunctionSpec"; import * as Schema from "effect/Schema"; let forced = 0; const spec = FunctionSpec.publicQuery({ name: "read", args: () => { forced++; return {}; }, returns: () => { forced++; return Schema.String; } }); export const probe = () => ({ valid: FunctionSpec.isFunctionSpec(spec), forced });',
    },
    value: { valid: true, forced: 0 },
    invoke: true,
  },
];

const outcome = (result: Result.Result<unknown, unknown>) =>
  Result.isSuccess(result)
    ? {
        _tag: "Success" as const,
        value: result.success,
        valueType: typeof result.success,
      }
    : { _tag: "Failure" as const, diagnostic: String(result.failure) };

export const runWith = <E, R>(
  evaluate: (entry: string, invoke: boolean) => Effect.Effect<unknown, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rows = yield* Effect.forEach(fixtures, (fixture) =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* fs.makeTempDirectoryScoped({
            directory: path.resolve(
              import.meta.dirname,
              "../../../../packages/cli/test",
            ),
            prefix: ".module-prototype-",
          });
          for (const [relative, source] of Object.entries(fixture.files)) {
            const file = path.join(root, relative);
            yield* fs.makeDirectory(path.dirname(file), { recursive: true });
            yield* fs.writeFileString(file, source);
          }
          const entry = path.join(root, "entry.ts");
          const baseline = outcome(
            yield* Effect.scoped(
              Effect.gen(function* () {
                const artifact = yield* Bundler.compile(entry);
                return yield* Runner.evaluateNative({
                  _tag: "Native",
                  url: artifact.url,
                  exportName: "probe",
                  invoke: fixture.invoke ?? false,
                });
              }).pipe(
                Effect.provide(
                  Compilation.layer({ mode: "Once", ownedDirectories: [] }),
                ),
              ),
            ).pipe(Effect.timeout("10 seconds"), Effect.result),
          );
          const candidate = outcome(
            yield* Effect.scoped(evaluate(entry, fixture.invoke ?? false)).pipe(
              Effect.timeout("10 seconds"),
              Effect.result,
            ),
          );
          const expected = (value: ReturnType<typeof outcome>) =>
            fixture.reject
              ? value._tag === "Failure"
              : value._tag === "Success" &&
                isDeepStrictEqual(value.value, fixture.value);
          return {
            name: fixture.name,
            oracleMatchesFixture: expected(baseline),
            compatible: expected(baseline) && expected(candidate),
            baseline,
            candidate,
          };
        }),
      ),
    );
    return { qualified: rows.every((row) => row.compatible), rows };
  });

export const run = runWith((entry, invoke) =>
  Effect.gen(function* () {
    const compiler = yield* Compiler.make(entry);
    const prepared = yield* compiler.compile;
    yield* prepared.validate;
    const value = yield* Runner.evaluate({
      snapshot: prepared.snapshot,
      exportName: "probe",
      invoke,
    });
    yield* prepared.validate;
    return value;
  }),
);
