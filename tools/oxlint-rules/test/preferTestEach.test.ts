import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { createRequire } from "node:module";

const prefix = 'import { it, test, layer } from "@effect/vitest";\n';
const oxlintManifestPath = createRequire(import.meta.url).resolve(
  "oxlint/package.json",
);

const lint = (code: string, fix = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const root = path.resolve(import.meta.dirname, "../../..");
    const manifest = yield* Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          bin: Schema.Struct({ oxlint: Schema.String }),
        }),
      ),
    )(yield* fs.readFileString(oxlintManifestPath));
    const oxlint = path.resolve(
      path.dirname(oxlintManifestPath),
      manifest.bin.oxlint,
    );
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "confect-each-",
    });
    const file = path.join(directory, "fixture.ts");
    const config = path.join(directory, "config.json");
    yield* fs.writeFileString(file, code);
    yield* fs.writeFileString(
      config,
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
        jsPlugins: [path.join(root, "tools/oxlint-rules/src/index.ts")],
        categories: { correctness: "off" },
        rules: { "confect/prefer-test-each": "error" },
      }),
    );
    const run = Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          process.execPath,
          [
            oxlint,
            "--config",
            config,
            "--format",
            "json",
            ...(fix ? ["--fix"] : []),
            file,
          ],
          { cwd: root, stdin: "ignore" },
        ),
      );
      return yield* Effect.all(
        {
          status: handle.exitCode,
          stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
          stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
        },
        { concurrency: "unbounded" },
      );
    });
    const result = yield* run;
    expect(result.stderr).toBe("");
    const output = yield* Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          diagnostics: Schema.Array(
            Schema.Struct({ code: Schema.String, message: Schema.String }),
          ),
        }),
      ),
    )(result.stdout);
    expect(
      output.diagnostics.every(
        (diagnostic) => diagnostic.code === "confect(prefer-test-each)",
      ),
    ).toBe(true);
    const text = yield* fs.readFileString(file);
    if (fix && text !== code) {
      const second = yield* run;
      expect(second.status).toBe(0);
      expect(yield* fs.readFileString(file)).toBe(text);
    }
    return { text, diagnostics: output.diagnostics };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("prefer-test-each", () => {
  it.effect.each([
    {
      name: "effect primitive row",
      code: 'for (const row of ["a", "b"] as const) { it.effect(`case ${row}`, () => run(row)); }',
      output:
        'it.effect.each(["a", "b"] as const)("case %s", (row) => run(row));',
    },
    {
      name: "live object row",
      code: 'for (const row of [{ name: "one", value: 1 }]) { it.live(`case ${row.name}`, () => run(row.value)); }',
      output:
        'it.live.each([{ name: "one", value: 1 }])("case $name", (row) => run(row.value));',
    },
    {
      name: "Effect tuple stays whole",
      code: 'for (const row of [[1, 2], [3, 4]]) it.effect("case", () => run(row[0], row[1]));',
      output:
        'it.effect.each([[1, 2], [3, 4]])("case", (row) => run(row[0], row[1]));',
    },
    {
      name: "plain primitive",
      code: 'for (const row of [1, 2]) test("case", () => run(row));',
      output: 'test.each([1, 2])("case", (row) => run(row));',
    },
    {
      name: "async callback and timeout",
      code: 'for (const row of [1]) it("case", async () => { await run(row); }, 1000);',
      output: 'it.each([1])("case", async (row) => { await run(row); }, 1000);',
    },
    {
      name: "parenthesized object return",
      code: 'for (const row of [1]) it("case", () => ({ value: row }));',
      output: 'it.each([1])("case", (row) => ({ value: row }));',
    },
    {
      name: "callback header comments",
      code: 'for (const row of [1]) it.effect("case", (/* parameter */) /* arrow */ => run(row));',
      output:
        'it.effect.each([1])("case", (row/* parameter */) /* arrow */ => run(row));',
    },
    {
      name: "preserves body and data comments",
      code: 'for (const row of [/* data */ 1]) it.effect("case", () => { /* body */ return run(row); });',
      output:
        'it.effect.each([/* data */ 1])("case", (row) => { /* body */ return run(row); });',
    },
  ])("fixes $name using the real parser and fixer", ({ code, output }) =>
    Effect.gen(function* () {
      expect((yield* lint(prefix + code)).diagnostics).toHaveLength(1);
      expect(yield* lint(prefix + code, true)).toEqual({
        text: prefix + output,
        diagnostics: [],
      });
    }),
  );

  it.effect.each([
    {
      name: "renamed effect import",
      code: 'import { it as check } from "@effect/vitest"; for (const x of xs) check.effect("case", () => run(x));',
    },
    {
      name: "namespace effect import",
      code: 'import * as V from "@effect/vitest"; for (const x of xs) V.it.live("case", () => run(x));',
    },
    {
      name: "plain Vitest alias",
      code: 'import { test as check } from "vitest"; for (const x of xs) check("case", () => run(x));',
    },
    {
      name: "const method alias",
      code:
        prefix +
        'const check = it.effect; for (const x of xs) check("case", () => run(x));',
    },
    {
      name: "layer scoped it",
      code:
        prefix +
        'layer(Service)("suite", (scoped) => { for (const x of xs) scoped.effect("case", () => run(x)); });',
    },
    {
      name: "nested scoped layer",
      code:
        prefix +
        'it.layer(Service)((outer) => { outer.layer(Other)((inner) => { for (const x of xs) inner.effect("case", () => run(x)); }); });',
    },
    {
      name: "forEach registration",
      code: prefix + 'xs.forEach((x) => { it.effect("case", () => run(x)); });',
    },
    {
      name: "expression forEach",
      code: prefix + 'xs.forEach((x) => it("case", () => run(x)));',
    },
    {
      name: "modifier",
      code:
        prefix + 'for (const x of xs) it.effect.skip("case", () => run(x));',
    },
  ])("reports $name", ({ code }) =>
    Effect.gen(function* () {
      expect((yield* lint(code)).diagnostics).toHaveLength(1);
    }),
  );

  it.effect.each([
    {
      name: "arbitrary effect member",
      code: 'const it = service; for (const x of xs) it.effect("case", () => run(x));',
    },
    {
      name: "unbound globals",
      code: 'for (const x of xs) test("case", () => run(x));',
    },
    {
      name: "shadowed import",
      code:
        prefix +
        'function f(it) { for (const x of xs) it.effect("case", () => run(x)); }',
    },
    {
      name: "shadowed namespace",
      code: 'import * as V from "@effect/vitest"; function f(V) { for (const x of xs) V.it.effect("case", () => run(x)); }',
    },
    {
      name: "unrelated layer callback",
      code: 'function layer() {} layer(Service)((it) => { for (const x of xs) it.effect("case", () => run(x)); });',
    },
    {
      name: "plain test has no Effect methods",
      code: prefix + 'for (const x of xs) test.effect("case", () => run(x));',
    },
    {
      name: "runtime assertions",
      code:
        prefix +
        'it.effect("case", () => Effect.gen(function* () { for (const x of xs) expect(x).toBe(1); }));',
    },
    {
      name: "runtime forEach",
      code: prefix + 'it("case", () => xs.forEach(x => expect(x).toBe(1)));',
    },
    {
      name: "nested helper is not registration",
      code:
        prefix +
        'for (const x of xs) { const helper = () => it.effect("case", () => run(x)); }',
    },
    {
      name: "existing each",
      code: prefix + 'it.effect.each(xs)("case", (x) => run(x));',
    },
    {
      name: "registration inside a running test",
      code:
        prefix +
        'it("outer", () => { for (const x of xs) it("inner", () => run(x)); });',
    },
    {
      name: "registration inside an each test",
      code:
        prefix +
        'it.effect.each([1])("outer", () => { for (const x of xs) it.effect("inner", () => run(x)); });',
    },
    {
      name: "reassigned alias",
      code:
        prefix +
        'let check = it; check = other; for (const x of xs) check("case", () => run(x));',
    },
    {
      name: "type-only import",
      code: 'import type { it } from "@effect/vitest"; for (const x of xs) it.effect("case", () => run(x));',
    },
  ])("ignores $name", ({ code }) =>
    Effect.gen(function* () {
      expect((yield* lint(code)).diagnostics).toHaveLength(0);
    }),
  );

  it.effect.each([
    {
      name: "setup",
      code: 'for (const x of [1]) { setup(x); it.effect("case", () => run(x)); }',
    },
    {
      name: "let loop binding",
      code: 'for (let x of [1]) it.effect("case", () => run(x));',
    },
    {
      name: "var live closure",
      code: 'for (var x of [1]) it.effect("case", () => run(x));',
    },
    {
      name: "external live binding",
      code: 'let x; for (x of [1]) it.effect("case", () => run(x));',
    },
    {
      name: "continue",
      code: 'for (const x of [1]) { if (skip(x)) continue; it.effect("case", () => run(x)); }',
    },
    {
      name: "conditional test",
      code: 'for (const x of [1]) { if (x) it.effect("case", () => run(x)); }',
    },
    {
      name: "context callback",
      code: 'for (const x of [1]) it.effect("case", (ctx) => run(x, ctx));',
    },
    {
      name: "plain tuple spreading",
      code: 'for (const x of [[1, 2]]) it("case", () => run(x));',
    },
    {
      name: "nontrivial title",
      code: "for (const x of [1]) it.effect(makeTitle(x), () => run(x));",
    },
    {
      name: "Set iterable",
      code: 'for (const x of new Set([1])) it.effect("case", () => run(x));',
    },
    {
      name: "unknown iterable",
      code: 'for (const x of cases) it.effect("case", () => run(x));',
    },
    {
      name: "mutable data expression",
      code: 'for (const x of [createCase()]) it.effect("case", () => run(x));',
    },
    {
      name: "callback expression",
      code: 'for (const x of [1]) it.effect("case", makeTest(x));',
    },
    {
      name: "callback binding conflict",
      code: 'for (const x of [1]) it.effect("case", () => { const x = 2; return run(x); });',
    },
    {
      name: "header comment",
      code: 'for (const /* keep me */ x of [1]) it.effect("case", () => run(x));',
    },
    {
      name: "registration comment",
      code: 'for (const x of [1]) { /* keep me */ it.effect("case", () => run(x)); }',
    },
    {
      name: "dynamic timeout",
      code: 'for (const x of [1]) it.effect("case", () => run(x), timeout(x));',
    },
    {
      name: "function expression",
      code: 'for (const x of [1]) it.effect("case", function() { return run(x); });',
    },
    {
      name: "dollar placeholders",
      code: 'for (const x of ["one"]) it.effect(`case $0 ${x}`, () => run(x));',
    },
    {
      name: "percent placeholders",
      code: 'for (const x of ["one"]) it.effect(`case %s ${x}`, () => run(x));',
    },
    {
      name: "object label adjacent suffix",
      code: 'for (const x of [{ name: "one" }]) it.effect(`case ${x.name}Suffix`, () => run(x));',
    },
    {
      name: "unsupported Unicode label placeholder",
      code: 'for (const x of [{ café: "one" }]) it.effect(`case ${x.café}`, () => run(x));',
    },
    {
      name: "duplicate object label property",
      code: 'for (const x of [{ name: "one", "name": { other: 1 } }]) it.effect(`case ${x.name}`, () => run(x));',
    },
    {
      name: "special prototype property",
      code: 'for (const x of [{ __proto__: "one" }]) it.effect(`case ${x.__proto__}`, () => run(x));',
    },
    {
      name: "destructured loop binding",
      code: 'for (const { name } of [{ name: "one" }]) it.effect(`case ${name}`, () => run(name));',
    },
    {
      name: "asynchronous iteration",
      code: 'async function register() { for await (const x of [1]) it.effect("case", () => run(x)); }',
    },
    {
      name: "forEach needs index",
      code: '[1].forEach((x, index) => it.effect("case", () => run(x, index)));',
    },
    {
      name: "two registrations",
      code: 'for (const x of [1]) { it.effect("first", () => run(x)); it.effect("second", () => run(x)); }',
      count: 2,
    },
  ])("leaves $name report-only", ({ code, count }) =>
    Effect.gen(function* () {
      const result = yield* lint(prefix + code, true);
      expect(result.text).toBe(prefix + code);
      expect(result.diagnostics).toHaveLength(count ?? 1);
    }),
  );
});

describe("Vitest each contracts", () => {
  it.effect.each(["one"])("primitive %s", (row) =>
    Effect.sync(() => {
      expect(row).toBe("one");
      expect(expect.getState().currentTestName).toMatch(/primitive one$/);
    }),
  );
  it.effect.each([{ name: "one", value: 1 }])("object $name", (row) =>
    Effect.sync(() => {
      expect(row).toEqual({ name: "one", value: 1 });
      expect(expect.getState().currentTestName).toMatch(/object one$/);
    }),
  );
  it.effect.each([[1, 2]] as const)("whole tuple", (row) =>
    Effect.sync(() => {
      expect(row).toEqual([1, 2]);
    }),
  );
});
