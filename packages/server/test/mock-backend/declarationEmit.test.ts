import * as Path from "@effect/platform/Path";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as String from "effect/String";
import * as ts from "typescript";

const compile = (entry: string) =>
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
      "fixtures/confect/_generated",
      entry,
    );
    const program = ts.createProgram([entryPath], options, host);
    const result = program.emit();

    const declarationPath = path.normalize(
      pipe(entryPath, String.replace(/\.ts$/, ".d.ts")),
    );

    const diagnostics = Array.appendAll(
      ts.getPreEmitDiagnostics(program),
      result.diagnostics,
    );

    return { host, emitted, declarationPath, diagnostics };
  });

const emitDeclaration = (entry: string) =>
  Effect.gen(function* () {
    const { host, emitted, declarationPath, diagnostics } =
      yield* compile(entry);

    const declaration = emitted.get(declarationPath);

    if (declaration === undefined) {
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

  // The aggregate modules (`refs.ts`, `schema.ts`, `spec.ts`) export the result
  // of a Confect builder call. Without an alias-headed annotation, declaration
  // emit must infer and serialize the fully-expanded result type, which trips
  // TS7056 ("inferred type ... exceeds the maximum length the compiler will
  // serialize") at scale. These tests assert clean emit (no diagnostics) and
  // snapshot the compact, reference-based `.d.ts` so a regression that
  // re-introduced expansion would change the snapshot.
  for (const entry of ["refs.ts", "schema.ts", "spec.ts"] as const) {
    it.effect(
      `${entry.replace(/\.ts$/, ".d.ts")} emits compact types without TS7056`,
      () =>
        Effect.gen(function* () {
          const { host, diagnostics } = yield* compile(entry);

          expect(
            ts.formatDiagnostics(diagnostics, host),
            `${entry} must emit declarations cleanly (no TS7056) — the default export needs an alias-headed annotation`,
          ).toBe("");

          const declaration = yield* emitDeclaration(entry);
          expect(declaration).toMatchSnapshot();
        }),
      60_000,
    );
  }
});
