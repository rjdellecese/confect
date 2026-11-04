import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const entries = ["services.ts", "docs.ts", "refs.ts", "schema.ts", "spec.ts"];

const TypeScriptConfig = Schema.fromJsonString(
  Schema.Struct({
    extends: Schema.String,
    compilerOptions: Schema.Struct({
      noEmit: Schema.Boolean,
      emitDeclarationOnly: Schema.Boolean,
      declaration: Schema.Boolean,
      declarationMap: Schema.Boolean,
      sourceMap: Schema.Boolean,
      rootDir: Schema.String,
      outDir: Schema.String,
      plugins: Schema.Array(
        Schema.Struct({ name: Schema.String, diagnostics: Schema.Boolean }),
      ),
    }),
    files: Schema.Array(Schema.String),
  }),
);

class DeclarationEmit extends Context.Service<
  DeclarationEmit,
  {
    /**
     * Everything `tsrs` printed. Declaration emit errors like TS7056 land here,
     * and every assertion below expects it to be empty.
     */
    readonly diagnostics: string;
    /**
     * Emitted `.d.ts` text, keyed by the `entries` name it came from.
     */
    readonly declarations: Record<string, string>;
  }
>()("@confect/server/test/mock-backend/declarationEmit.test/DeclarationEmit") {}

/**
 * Drives the Effect-enabled `tsrs` over a generated project and reads its
 * declarations. Launching the CLI with Node avoids platform-specific shell
 * shims and uses the same compiler as the package builds.
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

  const config = yield* Schema.encodeEffect(TypeScriptConfig)({
    extends: path.join(packageRoot, "tsconfig.json"),
    compilerOptions: {
      noEmit: false,
      emitDeclarationOnly: true,
      declaration: true,
      declarationMap: false,
      sourceMap: false,
      rootDir: packageRoot,
      outDir,
      // Oxlint owns Effect diagnostics; declaration emit should report only
      // TypeScript diagnostics on the stream asserted below.
      plugins: [{ name: "@effect/language-service", diagnostics: false }],
    },
    files: Array.map(entries, (entry) => path.join(generated, entry)),
  });

  yield* fs.writeFileString(configPath, config);

  const effectTsgo = path.dirname(
    yield* path.fromFileUrl(
      new URL(import.meta.resolve("@effect/tsgo/package.json")),
    ),
  );

  const diagnostics = yield* spawner.string(
    ChildProcess.make(process.execPath, [
      path.join(effectTsgo, "dist", "effect-tsgo.cjs"),
      "tsrs",
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
          "docs.ts must typecheck cleanly—non-object doc types require `type` aliases, not `interface … extends`",
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
