import { describe, expect, layer } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { createRequire } from "node:module";

const oxlintManifestPath = createRequire(import.meta.url).resolve(
  "oxlint/package.json",
);

describe("no-schema-codec-wrappers", () => {
  layer(NodeServices.layer)((it) => {
    it.effect.each([
      {
        name: "reports the typed options decoder from the review",
        code: `type Options = unknown;
const Options = Schema.Unknown;
const decodeOptions = (options: Options): Options =>
  Schema.decodeResult(Options)(options).pipe(Result.getOrThrow);`,
        missing: 1,
      },
      {
        name: "reports direct encoding and decoding across function forms",
        code: `const a = (value) => Schema.decodeUnknownSync(S)(value);
const b = function(value) { return Schema.encodeEffect(S)(value); };
function c(value) { return Schema.decodeUnknownResult(S)(value); }
const d = (value) => Schema.encodeUnknownOption(S)(value);
export default (value) => Schema.decodeResult(S)(value);`,
        missing: 5,
      },
      {
        name: "reports factory forwarding and generic schema arguments",
        code: `const a = (schema) => Schema.decodeSync(schema);
const b = (schema, value, options) => Schema.encodeResult(schema, options)(value);
const c = (value, options) => Schema.decodeUnknownResult(S, options)(value);`,
        missing: 3,
      },
      {
        name: "reports Result unwrapping in method and function pipelines",
        code: `const a = (value) => Result.getOrThrow(Schema.decodeResult(S)(value));
const b = (value) => pipe(Schema.encodeResult(S)(value), Result.getOrThrow);
const c = (value) => pipe(value, Schema.decodeUnknownResult(S), Result.getOrThrow);
const d = (value) => pipe(value, Schema.decodeEffect(S));`,
        missing: 4,
      },
      {
        name: "resolves aliased namespace and named imports",
        code: `import * as S from "effect/Schema";
import { decodeUnknownResult as decode } from "effect/Schema";
import { getOrThrow as unwrap } from "effect/Result";
import { pipe as p } from "effect/Function";
const a = (value) => S.encodeSync(X)(value);
const b = (value) => p(decode(X)(value), unwrap);`,
        missing: 2,
      },
      {
        name: "resolves root Effect imports",
        code: `import { Schema as S, Result as R, pipe as p } from "effect";
import * as E from "effect";
const a = (value) => S.decodeResult(X)(value).pipe(R.getOrThrow);
const b = (value) => p(value, E.Schema.encodeResult(X), E.Result.getOrThrow);`,
        missing: 2,
      },
      {
        name: "resolves immutable API and preconfigured codec aliases",
        code: `const S = Schema;
const decode = S.decodeUnknownSync;
const configured = decode(X);
const a = (value) => configured(value);`,
        missing: 2,
      },
      {
        name: "reports wrappers with fixed schema construction and options",
        code: `const a = (value) => Schema.decodeResult(Schema.Struct({ name: Schema.String }), { errors: "all" })(value);
const b = (value) => Schema.encodeResult(Schema.fromJsonString(Schema.Unknown, { space: 2 }))(value).pipe(Result.getOrThrow);`,
        missing: 2,
      },
      {
        name: "allows inline callback arity adapters and object methods",
        code: `values.map((value) => Schema.decodeUnknownSync(S)(value));
Array.filterMap(values, (value) => Schema.decodeResult(S)(value));
const adapter = { decode: (value) => Schema.decodeResult(S)(value) };`,
        missing: 0,
      },
      {
        name: "reports stored codec functions but allows inline codec calls",
        code: `const decodeOptions = Schema.decodeResult(S);
const encode = Schema.encodeSync(S);
const value = Schema.decodeResult(S)(input).pipe(Result.getOrThrow);
const result = pipe(input, Schema.decodeResult(S), Result.getOrThrow);`,
        missing: 2,
      },
      {
        name: "reports stored configuration and exported codec aliases",
        code: `const encodeJson = Schema.encodeResult(Schema.fromJsonString(Schema.Unknown, { space: 2 }));
const alias = encodeJson;
export default alias;
let decode = Schema.decodeResult(S, { errors: "all" });`,
        missing: 4,
      },
      {
        name: "allows reusable schemas constructors and inline combinators",
        code: `const Json = Schema.fromJsonString(Schema.Unknown, { space: 2 });
const encoded = Schema.encodeResult(Json)(input);
const value = Options.make(input);
const effect = Effect.flatMap(source, Schema.decodeEffect(Json));`,
        missing: 0,
      },
      {
        name: "allows transformations schema selection and custom errors",
        code: `const a = (value) => Schema.decodeResult(S)(value.trim());
const b = (value) => Schema.decodeResult(schemaFor(value))(value);
const c = (value) => Schema.decodeResult(S)(value).pipe(Result.map(normalize));
const d = (value) => Schema.decodeResult(S)(value).pipe(Result.mapError(toDomainError));`,
        missing: 0,
      },
      {
        name: "allows additional statements and branching",
        code: `function a(value) { audit(value); return Schema.decodeSync(S)(value); }
const b = (value) => value === null ? null : Schema.decodeSync(S)(value);
const c = (value) => { const schema = selectSchema(); return Schema.decodeSync(schema)(value); };`,
        missing: 0,
      },
      {
        name: "allows defaults destructuring rest and unused parameters",
        code: `const a = (value = fallback) => Schema.decodeSync(S)(value);
const b = ({ value }) => Schema.decodeSync(S)(value);
const c = (...values) => Schema.decodeSync(S)(...values);
const d = (value, unused) => Schema.decodeSync(S)(value);`,
        missing: 0,
      },
      {
        name: "allows lazy thunks async functions and generators",
        code: `const a = () => Schema.decodeSync(S)(input);
const b = async (value) => Schema.decodeSync(S)(value);
function* c(value) { return Schema.decodeSync(S)(value); }`,
        missing: 0,
      },
      {
        name: "ignores shadowed namespaces and named functions",
        code: `function a(Schema) { const parse = (value) => Schema.decodeSync(S)(value); return parse; }
import { decodeSync as decode } from "effect/Schema";
function b(decode) { const parse = (value) => decode(S)(value); return parse; }
function c() { const Schema = custom; const parse = (value) => Schema.decodeSync(S)(value); return parse; }`,
        missing: 0,
      },
      {
        name: "ignores lookalike APIs from unrelated modules",
        code: `import * as OtherSchema from "other-schema";
const LocalSchema = { decodeSync: makeDecoder };
const a = (value) => OtherSchema.decodeSync(S)(value);
const b = (value) => LocalSchema.decodeSync(S)(value);`,
        missing: 0,
      },
      {
        name: "ignores mutable and cyclic aliases",
        code: `let decode = Schema.decodeSync;
decode = customDecode;
const a = (value) => decode(S)(value);
const left = right;
const right = left;
const b = (value) => left(S)(value);`,
        missing: 0,
      },
      {
        name: "ignores unrelated Schema operations",
        code: `const a = (value) => Schema.decodeTo(S)(value);
const b = (value) => Schema.encodeKeys(S)(value);
const c = (value) => Schema.Struct(value);`,
        missing: 0,
      },
      {
        name: "requires unchanged one-time parameter forwarding",
        code: `const a = (value) => Schema.decodeSync(S)({ value });
const b = (value) => Schema.decodeSync(value)(value);
const c = (value) => Schema.decodeSync(S)(value = normalize(value));`,
        missing: 0,
      },
      {
        name: "does not treat custom unwrap or pipe functions as transparent",
        code: `function a(Result) { const parse = (value) => Schema.decodeResult(S)(value).pipe(Result.getOrThrow); return parse; }
function b(pipe) { const parse = (value) => pipe(value, Schema.decodeResult(S)); return parse; }
const c = (value) => Schema.decodeResult(S)(value).pipe(customUnwrap);`,
        missing: 0,
      },
      {
        name: "preserves custom throwing type assertions and optional calls",
        code: `const a = (value) => Schema.decodeResult(S)(value).pipe(Result.getOrThrowWith(toDomainError));
const b = (value) => Schema.decodeUnknownSync(S)(value) as Domain;
const c = (value) => Schema.decodeSync?.(S)(value);`,
        missing: 0,
      },
      {
        name: "ignores type-only imports",
        code: `import type * as S from "effect/Schema";
const a = (value) => S.decodeSync(X)(value);`,
        missing: 0,
      },
    ])("$name", ({ code, missing }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const root = path.resolve(import.meta.dirname, "../../..");
        const manifest = yield* fs.readFileString(oxlintManifestPath).pipe(
          Effect.flatMap(
            Schema.decodeEffect(
              Schema.fromJsonString(
                Schema.Struct({
                  bin: Schema.Struct({ oxlint: Schema.String }),
                }),
              ),
            ),
          ),
        );
        const oxlint = path.resolve(
          path.dirname(oxlintManifestPath),
          manifest.bin.oxlint,
        );
        const directory = yield* fs.makeTempDirectoryScoped({
          prefix: "confect-schema-wrappers-",
        });
        const file = path.join(directory, "fixture.ts");
        const config = path.join(directory, "config.json");
        const source = `import * as Schema from "effect/Schema";\nimport * as Result from "effect/Result";\nimport { pipe } from "effect/Function";\n${code}\n`;
        yield* fs.writeFileString(file, source);
        const configuration = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        )({
          jsPlugins: [path.join(root, "tools/oxlint-rules/src/index.ts")],
          categories: { correctness: "off" },
          rules: { "confect/no-schema-codec-wrappers": "error" },
        });
        yield* fs.writeFileString(config, configuration);
        const handle = yield* spawner.spawn(
          ChildProcess.make(
            process.execPath,
            [oxlint, "--config", config, "--format", "json", "--fix", file],
            { cwd: root, stdin: "ignore" },
          ),
        );
        const result = yield* Effect.all(
          {
            status: handle.exitCode,
            stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
            stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
          },
          { concurrency: "unbounded" },
        );
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
          Array.map(output.diagnostics, (diagnostic) => diagnostic.code),
        ).toEqual(
          missing === 0
            ? []
            : Array.replicate("confect(no-schema-codec-wrappers)", missing),
        );
        expect(
          Array.every(output.diagnostics, (diagnostic) =>
            /Use Schema\.(decode|encode)/.test(diagnostic.message),
          ),
        ).toBe(true);
        expect<number>(result.status).toBe(missing === 0 ? 0 : 1);
        const unchanged = yield* fs.readFileString(file);
        expect(unchanged).toBe(source);
      }).pipe(Effect.scoped),
    );
  });
});
