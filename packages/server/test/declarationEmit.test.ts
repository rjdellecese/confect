import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// Emit-size canary for the generated declarations, ported from a standalone
// script in `apps/example` into the suite so it travels with the package whose
// types it guards.
//
// `tsc` itself fails the build on `TS7056` (inferred type too large to
// serialize), so that overflow is already guarded by the compiler. This only
// adds a canary: a generated `.d.ts` exceeding its ceiling means a public type
// started expanding inline instead of printing by name — which would eventually
// trip `TS7056` on a larger schema than these fixtures.

const GENERATED_DIR = path.resolve(
  import.meta.dirname,
  "mock-backend/fixtures/confect/_generated",
);

// Sit well above current output (~5.6 KB) but far below the multi-hundred-KB
// expansions a regression produces.
const SIZE_LIMITS: Record<string, number> = {
  "services.d.ts": 30_000,
};

// Type-check the generated fixtures and capture their `.d.ts` emit in memory,
// resolving `@confect/server` against `src/` via the package's tsconfig.
const emitDeclarations = (): Map<string, string> => {
  const configPath = path.resolve(import.meta.dirname, "../tsconfig.json");
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
    [path.join(GENERATED_DIR, "services.ts")],
    options,
    host,
  );
  const result = program.emit();

  if (result.emitSkipped && emitted.size === 0) {
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .concat(result.diagnostics);
    throw new Error(
      `Declaration emit was skipped:\n${ts.formatDiagnostics(diagnostics, host)}`,
    );
  }

  return emitted;
};

describe("declaration emit", () => {
  const emitted = emitDeclarations();

  for (const [file, limit] of Object.entries(SIZE_LIMITS)) {
    it(`${file} stays compact (≤ ${limit} bytes)`, () => {
      const text = emitted.get(path.normalize(path.join(GENERATED_DIR, file)));

      expect(text, `${file} was not emitted`).toBeDefined();

      const size = Buffer.byteLength(text!, "utf8");

      expect(
        size,
        `${file} (${size} bytes) exceeded its ceiling — a public type is ` +
          "likely expanding inline instead of printing by name.",
      ).toBeLessThanOrEqual(limit);
    });
  }
});
