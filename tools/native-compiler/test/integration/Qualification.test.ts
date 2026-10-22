import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as esbuild from "esbuild";
import * as CompilationInputs from "../../../../packages/cli/src/CompilationInputs";
import * as CompilationPlugin from "../../../../packages/cli/src/CompilationPlugin";
import * as CompilationSources from "../../../../packages/cli/src/CompilationSources";
import * as ConvexConfig from "../../../../packages/cli/src/ConvexConfig";
import * as Authority from "../../src/Authority";
import * as Capture from "../../src/Capture";
import * as NativeService from "../../src/NativeService";
import * as Protocol from "../../src/Protocol";

const services = Layer.merge(NodeServices.layer, NodeCrypto.layer);
const operationFailed = (operation: string) => (cause: unknown) =>
  new Authority.AuthorityRejected({
    operation,
    reason: "QualificationOperationFailed",
    cause,
  });

const setup = Effect.fn("Qualification.setup")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "confect-native-" });
  const entry = path.join(root, "entry.ts");
  const owned = path.join(root, "_generated");
  const authored = path.join(owned, "authored.ts");
  const files: Readonly<Record<string, string>> = {
    "package.json": '{"type":"module"}',
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@alias/*":["src/*"]}}}',
    "src/value.ts": 'export const value: string = "alias";',
    "choice.js": 'export default "javascript";',
    "_generated/owned.ts": 'export default "owned";',
    "_generated/authored.ts": 'export default "authored";',
    "data.json": '{"plain":true}',
    "json.payload": '{"key":"json"}',
    "text.payload": "text-value",
    "node_modules/native-condition/package.json":
      '{"name":"native-condition","type":"module","exports":{"import":{"qualification":"./selected.js","default":"./default.js"},"require":"./required.cjs"}}',
    "node_modules/native-condition/selected.js":
      'export default "condition-selected";',
    "node_modules/native-condition/default.js":
      'export default "wrong-condition";',
    "node_modules/native-condition/required.cjs":
      'module.exports = "require-selected";',
    "entry.ts": [
      'import { value } from "@alias/value";',
      'import choice from "./choice";',
      'import owned from "./_generated/owned.ts";',
      'import authored from "./_generated/authored.ts";',
      'import plain from "./data.json";',
      'import json from "./json.payload" with { type: "json" };',
      'import jsonText from "./json.payload" with { type: "text" };',
      'import text from "./text.payload" with { type: "text" };',
      'import suffix from "./text.payload?variant" with { type: "text" };',
      'import bytes from "./bytes.payload" with { type: "bytes" };',
      'import external from "native-condition";',
      'import { basename } from "node:path";',
      "export default { value, choice, owned, authored, plain, json, jsonText, text, suffix, bytes: Array.from(bytes), external, filename: __filename, dirname: __dirname, url: import.meta.url, base: basename(__filename) };",
    ].join("\n"),
  };
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, file);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, contents);
  }
  yield* fs.writeFile(
    path.join(root, "bytes.payload"),
    new Uint8Array([0, 127, 128, 255]),
  );
  const options = {
    root,
    entries: [entry],
    outdir: path.join(root, "out"),
    conditions: ["qualification", "node"],
    ownedDirectories: [owned],
    authoredFiles: [authored],
  };
  const authority = yield* Authority.make(options);
  const native = yield* NativeService.make(
    path.resolve(import.meta.dirname, "../../bin/native-compiler.exe"),
    authority.resolve,
    { cwd: root },
  );
  yield* native.create(authority.options);
  return { fs, path, root, entry, files, options, authority, native };
});

const stock = Effect.fn("Qualification.stock")(function* (
  fixture: Effect.Success<ReturnType<typeof setup>>,
) {
  const { fs, path, options } = fixture;
  const inputs = yield* CompilationInputs.make("Once", options.conditions);
  const config = yield* inputs.configuration(fixture.entry);
  const resolver = yield* CompilationPlugin.make(
    path,
    fs,
    options.ownedDirectories,
    options.authoredFiles,
    options.conditions,
    inputs,
    options.entries,
  );
  const buildOptions: esbuild.BuildOptions = {
    absWorkingDir: options.root,
    entryPoints: options.entries,
    outdir: options.outdir,
    conditions: options.conditions,
    tsconfigRaw: config.tsconfigRaw,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: "external",
    metafile: true,
    write: false,
    logLevel: "silent",
    keepNames: true,
    plugins: [resolver.plugin],
  };
  const sources = yield* CompilationSources.make(
    buildOptions,
    inputs.trackSource,
  );
  const context = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => esbuild.context({ ...buildOptions, plugins: sources.plugins }),
      catch: operationFailed("stock context"),
    }),
    (ownedContext) => Effect.promise(() => ownedContext.dispose()),
  );
  return {
    rebuild: Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () => context.rebuild(),
        catch: operationFailed("stock rebuild"),
      });
      if (!result.metafile || !result.outputFiles)
        return yield* new Capture.CaptureRejected({
          reason: "IncompleteStockBuild",
          paths: [],
        });
      return {
        outputs: result.outputFiles,
        metafile: resolver.normalize(result.metafile, options.root),
        observed: yield* sources.inputs(result.metafile),
        warnings: result.warnings,
      };
    }),
  };
});

const executeFresh = Effect.fn("Qualification.executeFresh")(function* (
  fixture: Effect.Success<ReturnType<typeof setup>>,
  capture: Protocol.Capture,
) {
  for (const output of capture.outputs) {
    yield* fixture.fs.makeDirectory(fixture.path.dirname(output.path), {
      recursive: true,
    });
    yield* fixture.fs.writeFile(
      output.path,
      Buffer.from(output.bytesBase64, "base64"),
    );
  }
  const output = fixture.path.join(fixture.options.outdir, "entry.js");
  const result = yield* Effect.gen(function* () {
    const child = yield* ChildProcess.make(
      process.execPath,
      [
        "--conditions=qualification",
        "--input-type=module",
        "--eval",
        "const module = await import(process.argv[1]); process.stdout.write(JSON.stringify(module.default));",
        pathToFileURL(output).href,
      ],
      { stderr: "inherit" },
    );
    let length = 0;
    const stdout = yield* child.stdout.pipe(
      Stream.mapEffect((bytes) => {
        length += bytes.length;
        return length > 64 * 1024
          ? Effect.fail(
              new Capture.CaptureRejected({
                reason: "EvaluationOutputLimit",
                paths: [output],
              }),
            )
          : Effect.succeed(bytes);
      }),
      Stream.decodeText(),
      Stream.mkString,
    );
    if ((yield* child.exitCode) !== 0)
      return yield* new Capture.CaptureRejected({
        reason: "EvaluationFailed",
        paths: [output],
      });
    return stdout;
  }).pipe(Effect.timeout("5 seconds"), Effect.scoped);
  return yield* Schema.decodeEffect(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
  )(result);
});

layer(services, { excludeTestServices: true })(
  "native production-plugin qualification",
  (it) => {
    it.effect("matches Node file URL escaping in injected source bytes", () =>
      Effect.gen(function* () {
        const fixture = yield* setup();
        const name = "url ~!'()+,;=@&$ []é.ts";
        const source = fixture.path.join(fixture.root, name);
        yield* fixture.fs.writeFileString(
          source,
          "export default import.meta.url;",
        );
        yield* fixture.fs.writeFileString(
          fixture.entry,
          `export { default } from ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(`./${name}`)};`,
        );
        const comparator = yield* stock(fixture);
        yield* fixture.authority.begin(1);
        const first = yield* fixture.native.rebuild({ buildId: 1, epoch: 1 });
        yield* fixture.authority.check(first).pipe(Effect.result);
        yield* fixture.authority.begin(2);
        const capture = yield* fixture.native.rebuild({ buildId: 2, epoch: 2 });
        const accepted = yield* Capture.accept(capture, fixture.authority);
        const expected = yield* comparator.rebuild;
        expect(accepted.metafile).toEqual(expected.metafile);
        expect(capture.outputs.map((output) => output.bytesBase64)).toEqual(
          expected.outputs.map((output) =>
            Buffer.from(output.contents).toString("base64"),
          ),
        );
        const loaded = capture.sources.find((item) => item.path === source);
        expect(loaded).toBeDefined();
        expect(
          loaded && Buffer.from(loaded.bytesBase64, "base64").toString(),
        ).toContain(
          `const __injected_import_meta_url__ = ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(pathToFileURL(source).href)};`,
        );
      }).pipe(Effect.scoped),
    );

    it.effect(
      "matches actual plugins, loader bytes, normalized metafiles and fresh ESM across retained rebuilds",
      () =>
        Effect.gen(function* () {
          expect(esbuild.version).toBe(Protocol.esbuildVersion);
          const fixture = yield* setup();
          const crypto = yield* Crypto.Crypto;
          const comparator = yield* stock(fixture);
          yield* fixture.authority.begin(1);
          const provisional = yield* fixture.native.rebuild({
            buildId: 1,
            epoch: 1,
          });
          expect(provisional.errors).toEqual([]);
          const rejected = yield* Capture.accept(
            provisional,
            fixture.authority,
          ).pipe(Effect.result);
          expect(Result.isFailure(rejected)).toBe(true);
          if (Result.isFailure(rejected))
            expect(rejected.failure).toMatchObject({
              reason: "ProvisionalGeneration",
            });
          for (const revision of [2, 3]) {
            if (revision === 3)
              yield* fixture.fs.writeFileString(
                fixture.path.join(fixture.root, "choice.ts"),
                'export default "typescript";',
              );
            yield* fixture.authority.begin(revision);
            const capture = yield* fixture.native.rebuild({
              buildId: revision,
              epoch: revision,
            });
            const accepted = yield* Capture.accept(capture, fixture.authority);
            const expected = yield* comparator.rebuild;
            expect(accepted.metafile).toEqual(expected.metafile);
            expect(capture.warnings).toEqual(expected.warnings);
            expect(
              capture.outputs.map((output) => ({
                path: output.path,
                bytes: Buffer.from(output.bytesBase64, "base64"),
              })),
            ).toEqual(
              expected.outputs.map((output) => ({
                path: output.path,
                bytes: Buffer.from(output.contents),
              })),
            );
            for (const [file, fingerprint] of Object.entries(
              expected.observed,
            )) {
              const codec = Schema.fromJsonString(
                Schema.Array(Schema.NullOr(Schema.String)),
              );
              const production = yield* Schema.decodeEffect(codec)(fingerprint);
              const native = yield* Schema.decodeEffect(codec)(
                accepted.observed[file],
              );
              expect([native[0], ...native.slice(2)]).toEqual([
                production[0],
                ...production.slice(2),
              ]);
              if (production[1] !== null) expect(native[1]).toBe(production[1]);
            }
            expect(
              capture.sources.find((source) => source.path.endsWith("owned.ts"))
                ?.namespace,
            ).toBe("confect-generated");
            expect(
              capture.sources.find((source) =>
                source.path.endsWith("authored.ts"),
              )?.namespace,
            ).toBe("file");
            expect(
              capture.sources.some(
                (source) => source.sha256 !== source.originalSha256,
              ),
            ).toBe(true);
            for (const source of capture.sources) {
              const original =
                fixture.files[
                  fixture.path
                    .relative(fixture.root, source.path)
                    .split(fixture.path.sep)
                    .join("/")
                ];
              if (original !== undefined)
                expect(source.originalSha256).toBe(
                  Hex.encode(
                    yield* crypto.digest(
                      "SHA-256",
                      new TextEncoder().encode(original),
                    ),
                  ),
                );
            }
            const executed = yield* executeFresh(fixture, capture);
            expect(executed).toEqual({
              value: "alias",
              choice: revision === 2 ? "javascript" : "typescript",
              owned: "owned",
              authored: "authored",
              plain: { plain: true },
              json: { key: "json" },
              jsonText: '{"key":"json"}',
              text: "text-value",
              suffix: "text-value",
              bytes: [0, 127, 128, 255],
              external: "condition-selected",
              filename: fixture.entry,
              dirname: fixture.root,
              url: pathToFileURL(fixture.entry).href,
              base: "entry.ts",
            });
            const missing = {
              ...capture,
              sources: capture.sources.filter(
                (source) => source.path !== fixture.entry,
              ),
            };
            const incomplete = yield* Capture.accept(
              missing,
              fixture.authority,
            ).pipe(Effect.result);
            expect(Result.isFailure(incomplete)).toBe(true);
            if (Result.isFailure(incomplete))
              expect(incomplete.failure).toMatchObject({
                reason: "UnobservedMetafileInput",
              });
          }
          yield* fixture.native.dispose();
          yield* fixture.native.dispose();
          expect(fixture.native.diagnostics()).toEqual({
            stderr: "",
            pendingRequests: 0,
            pendingCallbacks: 0,
            closed: true,
          });
          expect(
            Result.isFailure(
              yield* fixture.native
                .rebuild({ buildId: 4, epoch: 4 })
                .pipe(Effect.result),
            ),
          ).toBe(true);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects stale epochs, changed configuration and forged byte captures",
      () =>
        Effect.gen(function* () {
          const fixture = yield* setup();
          yield* fixture.authority.begin(1);
          const first = yield* fixture.native.rebuild({ buildId: 1, epoch: 1 });
          yield* fixture.authority.check(first).pipe(Effect.result);
          yield* fixture.authority.begin(2);
          const capture = yield* fixture.native.rebuild({
            buildId: 2,
            epoch: 2,
          });
          yield* Capture.accept(capture, fixture.authority);
          const stale = yield* Capture.accept(first, fixture.authority).pipe(
            Effect.result,
          );
          expect(Result.isFailure(stale)).toBe(true);
          const forged = yield* Capture.accept(
            {
              ...capture,
              sources: capture.sources.map((source, index) =>
                index === 0 ? { ...source, sha256: "0".repeat(64) } : source,
              ),
            },
            fixture.authority,
          ).pipe(Effect.result);
          expect(Result.isFailure(forged)).toBe(true);
          if (Result.isFailure(forged))
            expect(forged.failure).toMatchObject({
              reason: "InvalidByteDigest",
            });
          const escaped = yield* Capture.accept(
            {
              ...capture,
              outputs: capture.outputs.map((output, index) =>
                index === 0
                  ? {
                      ...output,
                      path: fixture.path.join(fixture.root, "outside.js"),
                    }
                  : output,
              ),
            },
            fixture.authority,
          ).pipe(Effect.result);
          expect(Result.isFailure(escaped)).toBe(true);
          if (Result.isFailure(escaped))
            expect(escaped.failure).toMatchObject({
              reason: "OutputOutsideDirectory",
            });
          yield* fixture.fs.writeFileString(
            fixture.path.join(fixture.root, "tsconfig.json"),
            '{"compilerOptions":{"strict":true}}',
          );
          const changed = yield* Capture.accept(
            capture,
            fixture.authority,
          ).pipe(Effect.result);
          expect(Result.isFailure(changed)).toBe(true);
          if (Result.isFailure(changed))
            expect(changed.failure._tag).toBe("CompilationRestartRequired");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "fails explicitly on unsupported component wrappers and keeps Convex behavior out of the support claim",
      () =>
        Effect.gen(function* () {
          const fixture = yield* setup();
          yield* fixture.fs.writeFileString(
            fixture.entry,
            'import definition from "./component/convex.config.ts"; export default definition;',
          );
          yield* fixture.fs.makeDirectory(
            fixture.path.join(fixture.root, "component"),
          );
          yield* fixture.fs.writeFileString(
            fixture.path.join(fixture.root, "component/convex.config.ts"),
            'export default { _name: "example" };',
          );
          yield* fixture.authority.begin(1);
          const rejected = yield* fixture.native.rebuild({
            buildId: 1,
            epoch: 1,
          });
          expect(rejected.status).toBe("Failed");
          expect(
            rejected.errors.some((error) =>
              error.text.includes("UnsupportedComponent"),
            ),
          ).toBe(true);
          const result = yield* Effect.tryPromise({
            try: () =>
              esbuild.build({
                absWorkingDir: fixture.root,
                entryPoints: [fixture.entry],
                bundle: true,
                write: false,
                format: "esm",
                platform: "node",
                plugins: [ConvexConfig.componentConfigPlugin(fixture.path)],
              }),
            catch: operationFailed("component comparator"),
          });
          expect(result.outputFiles?.[0]?.text).toContain(
            "componentDefinitionPath",
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        name: "unsupported attributes",
        entry:
          'import value from "./text.payload" with { type: "css" }; export default value;',
        error: "UnsupportedImportAttributes",
      },
      {
        name: "data URLs",
        entry:
          'import value from "data:text/javascript,export default 1"; export default value;',
        error: "UnsupportedNamespace",
      },
      {
        name: "unknown loader",
        entry: 'import value from "./text.payload"; export default value;',
        error: "UnsupportedLoader",
      },
    ])("rejects $name instead of falling back", (testCase) =>
      Effect.gen(function* () {
        const fixture = yield* setup();
        yield* fixture.fs.writeFileString(fixture.entry, testCase.entry);
        yield* fixture.authority.begin(1);
        const capture = yield* fixture.native.rebuild({ buildId: 1, epoch: 1 });
        expect(capture.status).toBe("Failed");
        expect(
          capture.errors.some((error) => error.text.includes(testCase.error)),
        ).toBe(true);
        expect(capture.outputs).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects lexical and symlink aliases of protected files before loading",
      () =>
        Effect.gen(function* () {
          const fixture = yield* setup();
          const protectedPath = fixture.path.join(fixture.root, ".env.local");
          yield* fixture.fs.writeFileString(
            protectedPath,
            "nonsecret qualification sentinel",
          );
          const alias = fixture.path.join(fixture.root, "protected-alias.json");
          yield* fixture.fs.symlink(protectedPath, alias);
          for (const [index, specifier] of [
            "./.env.local",
            "./protected-alias.json",
          ].entries()) {
            yield* fixture.fs.writeFileString(
              fixture.entry,
              `import value from "${specifier}" with { type: "text" }; export default value;`,
            );
            const epoch = index + 1;
            yield* fixture.authority.begin(epoch);
            const capture = yield* fixture.native.rebuild({
              buildId: epoch,
              epoch,
            });
            expect(capture.status).toBe("Failed");
            expect(capture.errors).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  pluginName: "confect:native-boundary",
                  text: expect.stringMatching(/^ForbiddenFile:/),
                }),
              ]),
            );
            expect(
              capture.sources.some(
                (source) =>
                  source.path === protectedPath || source.path === alias,
              ),
            ).toBe(false);
          }
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves structured native parser diagnostics against the production loader",
      () =>
        Effect.gen(function* () {
          const fixture = yield* setup();
          yield* fixture.fs.writeFileString(fixture.entry, "export const = ;");
          const comparator = yield* stock(fixture);
          yield* fixture.authority.begin(1);
          const capture = yield* fixture.native.rebuild({
            buildId: 1,
            epoch: 1,
          });
          const expected = yield* comparator.rebuild.pipe(Effect.result);
          expect(capture.status).toBe("Failed");
          expect(capture.errors[0]?.location).toMatchObject({
            file: "entry.ts",
            line: 1,
          });
          expect(Result.isFailure(expected)).toBe(true);
          if (
            Result.isFailure(expected) &&
            expected.failure._tag === "NativeAuthorityRejected"
          ) {
            const failure = yield* Schema.decodeUnknownEffect(
              Schema.Struct({ errors: Schema.Array(Protocol.Diagnostic) }),
            )(expected.failure.cause);
            expect(capture.errors).toEqual(failure.errors);
          }
        }).pipe(Effect.scoped),
    );
    it.effect(
      "keeps import, dynamic-import and require external decisions under the real Node resolver",
      () =>
        Effect.gen(function* () {
          const fixture = yield* setup();
          yield* fixture.fs.writeFileString(
            fixture.entry,
            [
              'import imported from "native-condition";',
              'export const dynamic = () => import("native-condition");',
              'export const required = () => require("native-condition");',
              'export const resolved = () => require.resolve("native-condition");',
              "export default imported;",
            ].join("\n"),
          );
          const comparator = yield* stock(fixture);
          yield* fixture.authority.begin(1);
          const first = yield* fixture.native.rebuild({ buildId: 1, epoch: 1 });
          yield* fixture.authority.check(first).pipe(Effect.result);
          yield* fixture.authority.begin(2);
          const capture = yield* fixture.native.rebuild({
            buildId: 2,
            epoch: 2,
          });
          const accepted = yield* Capture.accept(capture, fixture.authority);
          const expected = yield* comparator.rebuild;
          expect(accepted.metafile).toEqual(expected.metafile);
          expect(capture.outputs.map((output) => output.bytesBase64)).toEqual(
            expected.outputs.map((output) =>
              Buffer.from(output.contents).toString("base64"),
            ),
          );
          const imports = accepted.metafile.inputs["entry.ts"].imports;
          for (const kind of ["import-statement", "dynamic-import"])
            expect(imports).toContainEqual(
              expect.objectContaining({
                kind,
                external: true,
                original: "native-condition",
                path: fixture.path
                  .join(
                    fixture.root,
                    "node_modules/native-condition/selected.js",
                  )
                  .split(fixture.path.sep)
                  .join("/"),
              }),
            );
          for (const kind of ["require-call"])
            expect(imports).toContainEqual(
              expect.objectContaining({
                kind,
                external: true,
                original: "native-condition",
                path: fixture.path.join(
                  fixture.root,
                  "node_modules/native-condition/required.cjs",
                ),
              }),
            );
          expect(imports.some((item) => item.kind === "require-resolve")).toBe(
            false,
          );
          expect(
            expected.outputs.find((output) => output.path.endsWith(".js"))
              ?.text,
          ).toContain('.resolve("native-condition")');
        }).pipe(Effect.scoped),
    );

    it.effect.each(["cancel", "dispose"] as const)(
      "settles live native callbacks before %s acknowledgement",
      (operation) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped({
            prefix: "confect-native-lifecycle-",
          });
          const entry = path.join(root, "entry.ts");
          yield* fs.writeFileString(entry, "export default 1;");
          const entered = yield* Deferred.make<void>();
          const settled = yield* Deferred.make<void>();
          let block = true;
          const native = yield* NativeService.make(
            path.resolve(import.meta.dirname, "../../bin/native-compiler.exe"),
            () =>
              Effect.gen(function* () {
                if (block) {
                  yield* Deferred.succeed(entered, undefined);
                  return yield* Effect.never.pipe(
                    Effect.ensuring(Deferred.succeed(settled, undefined)),
                  );
                }
                return { mode: "probe" } as const;
              }),
          );
          yield* native.create({
            root,
            entries: [entry],
            outdir: path.join(root, "out"),
            conditions: [],
            tsconfigRaw: "{}",
          });
          const build = yield* native
            .rebuild({ buildId: 1, epoch: 1 })
            .pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          if (operation === "cancel") yield* native.cancel(1);
          else yield* native.dispose();
          expect(yield* Deferred.isDone(settled)).toBe(true);
          const capture = yield* Fiber.join(build);
          expect(capture.status).toBe("Cancelled");
          expect(capture.outputs).toEqual([]);
          expect(capture.sources).toEqual([]);
          expect(native.diagnostics().pendingCallbacks).toBe(0);
          if (operation === "cancel") {
            block = false;
            const recovered = yield* native.rebuild({ buildId: 2, epoch: 2 });
            expect(recovered.status).toBe("Succeeded");
          }
          yield* native.dispose();
          expect(native.diagnostics().closed).toBe(true);
        }).pipe(Effect.scoped),
    );
  },
);
