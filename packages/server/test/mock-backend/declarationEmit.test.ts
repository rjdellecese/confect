import * as Path from "effect/Path";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as String from "effect/String";
import * as ts from "typescript";

const entries = ["services.ts", "docs.ts", "refs.ts", "schema.ts", "spec.ts"];

class CompiledProgram extends Context.Service<
  CompiledProgram,
  {
    readonly host: ts.CompilerHost;
    readonly emitted: ReadonlyMap<string, string>;
    readonly program: ts.Program;
    readonly emitResult: ts.EmitResult;
  }
>()("@confect/server/test/mock-backend/declarationEmit.test/CompiledProgram") {}

const buildProgram = Effect.gen(function* () {
  const path = yield* Path.Path;

  const entryPath = (entry: string) =>
    path.resolve(import.meta.dirname, "fixtures/confect/_generated", entry);

  const configPath = path.resolve(import.meta.dirname, "../../tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );

  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
  };

  const emitted = new Map<string, string>();
  const host = ts.createCompilerHost(options);
  host.writeFile = (fileName, text) => {
    emitted.set(path.normalize(fileName), text);
  };

  const program = ts.createProgram(
    Array.map(entries, entryPath),
    options,
    host,
  );
  const emitResult = program.emit();

  return { host, emitted, program, emitResult };
});

const TestLayer = Layer.provideMerge(
  Layer.effect(CompiledProgram, buildProgram),
  NodePath.layer,
);

const compile = (entry: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { host, emitted, program, emitResult } = yield* CompiledProgram;

    const entryPath = path.resolve(
      import.meta.dirname,
      "fixtures/confect/_generated",
      entry,
    );
    const sourceFile = program.getSourceFile(entryPath);

    const declarationPath = path.normalize(
      pipe(entryPath, String.replace(/\.ts$/, ".d.ts")),
    );

    const diagnostics = Array.appendAll(
      ts.getPreEmitDiagnostics(program, sourceFile),
      Array.filter(
        emitResult.diagnostics,
        (diagnostic) => diagnostic.file === sourceFile,
      ),
    );

    return { host, emitted, declarationPath, diagnostics };
  });

const emitDeclaration = (entry: string) =>
  Effect.gen(function* () {
    const { host, emitted, declarationPath, diagnostics } =
      yield* compile(entry);

    const declaration = emitted.get(declarationPath);

    if (declaration === undefined) {
      return yield* Effect.die(
        new Error(
          `${entry} produced no declaration emit:\n${ts.formatDiagnostics(diagnostics, host)}`,
        ),
      );
    }

    return declaration;
  });

layer(TestLayer, { timeout: "60 seconds" })("declaration emit", (it) => {
  it.effect(
    "services.d.ts prints public types by name",
    () =>
      Effect.gen(function* () {
        const declaration = yield* emitDeclaration("services.ts");
        expect(declaration).toMatchSnapshot();
      }),
    60_000,
  );

  it.effect(
    "docs.d.ts emits non-object (union) document types without error",
    () =>
      Effect.gen(function* () {
        const { host, diagnostics } = yield* compile("docs.ts");

        expect(
          ts.formatDiagnostics(diagnostics, host),
          "docs.ts must typecheck cleanly — non-object doc types require `type` aliases, not `interface … extends`",
        ).toBe("");
      }),
    60_000,
  );

  it.effect.each(["refs.ts", "schema.ts", "spec.ts"])(
    "%s emits a declaration without TS7056",
    (entry) =>
      Effect.gen(function* () {
        const { host, emitted, declarationPath, diagnostics } =
          yield* compile(entry);

        expect(ts.formatDiagnostics(diagnostics, host)).toBe("");
        expect(emitted.get(declarationPath)).toMatchSnapshot();
      }),
    60_000,
  );
});
