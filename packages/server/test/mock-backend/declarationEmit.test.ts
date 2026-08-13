import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as String from "effect/String";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

const entries = ["services.ts", "docs.ts", "refs.ts", "schema.ts", "spec.ts"];

class DeclarationEmit extends Context.Service<
  DeclarationEmit,
  {
    /**
     * Everything `tsc` printed. Declaration emit errors like TS7056 land here,
     * and every assertion below expects it to be empty.
     */
    readonly diagnostics: string;
    /** Emitted `.d.ts` text, keyed by the `entries` name it came from. */
    readonly declarations: Record<string, string>;
  }
>()("@confect/server/test/mock-backend/declarationEmit.test/DeclarationEmit") {}

/**
 * TypeScript 7 is a native binary: the `typescript` package no longer exports a
 * JavaScript compiler API to build a `Program` with, so this drives the real
 * `tsc` over a generated project and reads what it wrote. `lib/tsc.js` is the
 * package's own launcher, which finds the platform binary — going through it
 * (rather than `node_modules/.bin/tsc`) keeps the spawn identical on Windows,
 * where the bin entry is a shell script.
 */
const emitDeclarations = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;

  const packageRoot = path.resolve(import.meta.dirname, "../..");
  const generated = path.resolve(
    import.meta.dirname,
    "fixtures/confect/_generated",
  );

  const workDir = yield* fs.makeTempDirectoryScoped();
  const outDir = path.join(workDir, "out");
  const configPath = path.join(workDir, "tsconfig.json");

  yield* fs.writeFileString(
    configPath,
    JSON.stringify({
      extends: path.join(packageRoot, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        emitDeclarationOnly: true,
        declaration: true,
        declarationMap: false,
        sourceMap: false,
        rootDir: packageRoot,
        outDir,
        // Suggestion-level Effect diagnostics (`schemaNumber`, `lazyEffect`,
        // …) are advice about the sources these entries pull in, not emit
        // failures, and `tsc` prints them on the same stream the assertions
        // below expect to be empty.
        plugins: [
          { name: "@effect/language-service", includeSuggestionsInTsc: false },
        ],
      },
      files: Array.map(entries, (entry) => path.join(generated, entry)),
    }),
  );

  const typescript = path.dirname(
    yield* path.fromFileUrl(
      new URL(import.meta.resolve("typescript/package.json")),
    ),
  );

  const diagnostics = yield* spawner.string(
    ChildProcess.make(process.execPath, [
      path.join(typescript, "lib", "tsc.js"),
      "--project",
      configPath,
      "--pretty",
      "false",
    ]),
  );

  const declarationPath = (entry: string) =>
    path.join(
      outDir,
      path.relative(
        packageRoot,
        path.join(generated, String.replace(/\.ts$/, ".d.ts")(entry)),
      ),
    );

  const declarations = yield* Effect.forEach(entries, (entry) =>
    fs.exists(declarationPath(entry)).pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs.readFileString(declarationPath(entry))
          : Effect.die(
              new Error(
                `${entry} produced no declaration emit:\n${diagnostics}`,
              ),
            ),
      ),
      Effect.map((declaration) => [entry, declaration] as const),
    ),
  ).pipe(Effect.map(Record.fromEntries));

  return { diagnostics, declarations };
});

const TestLayer = Layer.provideMerge(
  Layer.effect(DeclarationEmit, emitDeclarations),
  NodeServices.layer,
);

layer(TestLayer, { timeout: "120 seconds" })("declaration emit", (it) => {
  it.effect(
    "services.d.ts prints public types by name",
    () =>
      Effect.gen(function* () {
        const { declarations } = yield* DeclarationEmit;
        expect(declarations["services.ts"]).toMatchSnapshot();
      }),
    120_000,
  );

  it.effect(
    "docs.d.ts emits non-object (union) document types without error",
    () =>
      Effect.gen(function* () {
        const { diagnostics } = yield* DeclarationEmit;

        expect(
          diagnostics,
          "docs.ts must typecheck cleanly — non-object doc types require `type` aliases, not `interface … extends`",
        ).toBe("");
      }),
    120_000,
  );

  it.effect.each(["refs.ts", "schema.ts", "spec.ts"])(
    "%s emits a declaration without TS7056",
    (entry) =>
      Effect.gen(function* () {
        const { declarations, diagnostics } = yield* DeclarationEmit;

        expect(diagnostics).toBe("");
        expect(declarations[entry]).toMatchSnapshot();
      }),
    120_000,
  );
});
