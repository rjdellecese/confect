import * as Command from "@effect/platform/Command";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as String from "effect/String";

const entries = ["services.ts", "docs.ts", "refs.ts", "schema.ts", "spec.ts"];

// TypeScript 7 dropped the JavaScript compiler API — the `typescript` package
// is now a thin shim over a native binary, so there is no `ts.createProgram` to
// drive in-process. Declaration emit is instead exercised the way a consumer
// would: run `tsc` over the generated entrypoints and read what it writes.
class DeclarationEmit extends Context.Tag(
  "@confect/server/test/mock-backend/declarationEmit.test/DeclarationEmit",
)<
  DeclarationEmit,
  {
    /** Emitted `.d.ts` text, keyed by entry (e.g. `services.ts`). */
    readonly emitted: ReadonlyMap<string, string>;
    /** Diagnostics attributed to each entry, keyed by entry. Empty when clean. */
    readonly diagnostics: ReadonlyMap<string, string>;
  }
>() {}

/**
 * Splits `tsc --pretty false` output into per-file diagnostic blocks.
 *
 * Each diagnostic opens with `<file>(<line>,<col>): error TS1234: …`; wrapped
 * message lines that follow are indented and belong to the diagnostic above
 * them. Anything printed before the first such header (a config error, say) has
 * no file to attribute it to, so it is returned separately rather than dropped.
 */
const groupDiagnosticsByFile = (
  output: string,
): {
  readonly byFile: ReadonlyMap<string, string>;
  readonly unattributed: string;
} => {
  const header = /^(.+?)\(\d+,\d+\): (?:error|warning|message) TS\d+:/;

  const byFile = new Map<string, Array<string>>();
  const unattributed: Array<string> = [];
  let current: Array<string> | undefined;

  for (const line of String.split(output, "\n")) {
    if (String.trim(line) === "") continue;

    const match = header.exec(line);
    if (match !== null) {
      const file = match[1]!;
      current = byFile.get(file) ?? [];
      byFile.set(file, current);
    }

    if (current === undefined) {
      unattributed.push(line);
    } else {
      current.push(line);
    }
  }

  return {
    byFile: new Map(
      Array.map([...byFile], ([file, lines]) => [
        file,
        `${Array.join(lines, "\n")}\n`,
      ]),
    ),
    unattributed: Array.join(unattributed, "\n"),
  };
};

const buildDeclarationEmit = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const serverRoot = path.resolve(import.meta.dirname, "../..");
  const generatedDir = path.join(
    serverRoot,
    "test/mock-backend/fixtures/confect/_generated",
  );

  const tempDir = yield* fs.makeTempDirectoryScoped();
  const outDir = path.join(tempDir, "out");
  const configPath = path.join(tempDir, "tsconfig.json");

  // Extending the package's own tsconfig keeps the compiler options (and its
  // `paths`, which resolve relative to the file they came from) identical to a
  // real build; `files` narrows the program to just the generated entrypoints.
  yield* fs.writeFileString(
    configPath,
    JSON.stringify({
      extends: path.join(serverRoot, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        rootDir: serverRoot,
        outDir,
      },
      files: Array.map(entries, (entry) => path.join(generatedDir, entry)),
    }),
  );

  // Spawned through `node` rather than the `.bin` shim so the same path works
  // on Windows, where the shim is a `.CMD` file.
  const tsc = path.join(serverRoot, "node_modules/typescript/lib/tsc.js");

  const output = yield* Command.string(
    Command.make(
      process.execPath,
      tsc,
      "-p",
      configPath,
      "--pretty",
      "false",
    ).pipe(Command.workingDirectory(serverRoot)),
  );

  const { byFile, unattributed } = groupDiagnosticsByFile(output);

  if (unattributed !== "") {
    return yield* Effect.dieMessage(
      `tsc failed before it could emit anything:\n${unattributed}`,
    );
  }

  // Diagnostic paths are printed relative to tsc's working directory.
  const diagnostics = new Map(
    Array.map(entries, (entry) => {
      const entryPath = path.join(generatedDir, entry);
      const forEntry = Array.findFirst(
        [...byFile],
        ([file]) => path.resolve(serverRoot, file) === entryPath,
      );
      return [
        entry,
        Option.match(forEntry, {
          onNone: () => "",
          onSome: ([, text]) => text,
        }),
      ];
    }),
  );

  const emitted = new Map(
    yield* Effect.forEach(entries, (entry) =>
      Effect.gen(function* () {
        const declarationPath = path.join(
          outDir,
          "test/mock-backend/fixtures/confect/_generated",
          pipe(entry, String.replace(/\.ts$/, ".d.ts")),
        );
        const exists = yield* fs.exists(declarationPath);
        return [
          entry,
          exists ? yield* fs.readFileString(declarationPath) : undefined,
        ] as const;
      }),
    ).pipe(
      Effect.map(
        Array.filterMap(([entry, text]) =>
          text === undefined
            ? Option.none()
            : Option.some([entry, text] as const),
        ),
      ),
    ),
  );

  return { emitted, diagnostics };
});

const TestLayer = Layer.provideMerge(
  Layer.scoped(DeclarationEmit, buildDeclarationEmit),
  NodeContext.layer,
);

const declarationFor = (entry: string) =>
  Effect.gen(function* () {
    const { emitted, diagnostics } = yield* DeclarationEmit;
    const declaration = emitted.get(entry);

    if (declaration === undefined) {
      return yield* Effect.dieMessage(
        `${entry} produced no declaration emit:\n${diagnostics.get(entry) ?? ""}`,
      );
    }

    return declaration;
  });

const diagnosticsFor = (entry: string) =>
  Effect.map(
    DeclarationEmit,
    ({ diagnostics }) => diagnostics.get(entry) ?? "",
  );

layer(TestLayer, { timeout: "60 seconds" })("declaration emit", (it) => {
  it.effect(
    "services.d.ts prints public types by name",
    () =>
      Effect.gen(function* () {
        const declaration = yield* declarationFor("services.ts");
        expect(declaration).toMatchSnapshot();
      }),
    60_000,
  );

  it.effect(
    "docs.d.ts emits non-object (union) document types without error",
    () =>
      Effect.gen(function* () {
        expect(
          yield* diagnosticsFor("docs.ts"),
          "docs.ts must typecheck cleanly — non-object doc types require `type` aliases, not `interface … extends`",
        ).toBe("");
      }),
    60_000,
  );

  it.effect.each(["refs.ts", "schema.ts", "spec.ts"])(
    "%s emits a declaration without TS7056",
    (entry) =>
      Effect.gen(function* () {
        expect(yield* diagnosticsFor(entry)).toBe("");
        expect(yield* declarationFor(entry)).toMatchSnapshot();
      }),
    60_000,
  );
});
