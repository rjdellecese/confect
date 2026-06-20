import * as Path from "@effect/platform/Path";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as String from "effect/String";
import * as ts from "typescript";

// Snapshot the generated declarations' `.d.ts` emit, ported from a standalone
// size script in `apps/example` into the suite so it travels with the package
// whose types it guards.
//
// `tsc` itself fails the build on `TS7056` (inferred type too large to
// serialize), so that overflow is already guarded by the compiler. This adds an
// early warning: a public type that starts expanding inline instead of printing
// by name shows up here as a large, obvious diff (and would eventually trip
// `TS7056` on a larger schema than these fixtures). The committed snapshot is
// the baseline — when the emit changes legitimately, review the diff and update
// it with `vitest -u`.

// Type-check a generated fixture and return its `.d.ts` emit, resolving
// `@confect/server` against `src/` via the package's tsconfig.
const emitDeclaration = (entry: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

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

    const entryPath = path.resolve(
      import.meta.dirname,
      "../mock-backend/fixtures/confect/_generated",
      entry,
    );
    const program = ts.createProgram([entryPath], options, host);
    const result = program.emit();

    const declarationPath = path.normalize(
      pipe(entryPath, String.replace(/\.ts$/, ".d.ts")),
    );
    const declaration = emitted.get(declarationPath);

    if (declaration === undefined) {
      const diagnostics = Array.appendAll(
        ts.getPreEmitDiagnostics(program),
        result.diagnostics,
      );
      return yield* Effect.dieMessage(
        `${entry} produced no declaration emit:\n${ts.formatDiagnostics(diagnostics, host)}`,
      );
    }

    return declaration;
  });

layer(NodePath.layer)("declaration emit", (it) => {
  it.effect(
    "services.d.ts prints public types by name",
    () =>
      Effect.gen(function* () {
        const declaration = yield* emitDeclaration("services.ts");
        expect(declaration).toMatchSnapshot();
      }),
    60_000,
  );
});
