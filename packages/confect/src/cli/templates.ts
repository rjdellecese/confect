import type { Options as CodeBlockWriterOptions } from "code-block-writer";
import CodeBlockWriter_ from "code-block-writer";
import { Array, Effect } from "effect";

export const functions = ({
  dirs,
  mod,
  fns,
  serverImportPath,
}: {
  dirs: string[];
  mod: string;
  fns: string[];
  serverImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import server from "${serverImportPath}";`);
    yield* cbw.newLine();
    for (const fn of fns) {
      yield* cbw.writeLine(
        `export const ${fn} = ${Array.join(["server", "registeredFunctions", ...dirs, mod, fn], ".")};`,
      );
    }

    return yield* cbw.toString();
  });

export const schema = ({ schemaImportPath }: { schemaImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import confectSchemaDefinition from "${schemaImportPath}";`,
    );
    yield* cbw.newLine();
    yield* cbw.writeLine(
      `export default confectSchemaDefinition.convexSchemaDefinition;`,
    );

    return yield* cbw.toString();
  });

export const http = ({ httpImportPath }: { httpImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import http from "${httpImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default http;`);

    return yield* cbw.toString();
  });

export const refs = ({ specImportPath }: { specImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import { ConfectApiRefs } from "@rjdellecese/confect/api";`,
    );
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`const refs = ConfectApiRefs.make(spec);`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export const api = ConfectApiRefs.justPublic(refs);`);
    yield* cbw.writeLine(
      `export const internal = ConfectApiRefs.justInternal(refs);`,
    );

    return yield* cbw.toString();
  });

export const services = ({ schemaImportPath }: { schemaImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    // Imports
    yield* cbw.writeLine("import {");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ConfectActionRunner as ConfectActionRunner_,");
        yield* cbw.writeLine("ConfectAuth as ConfectAuth_,");
        yield* cbw.writeLine(
          "ConfectDatabaseReader as ConfectDatabaseReader_,",
        );
        yield* cbw.writeLine(
          "ConfectDatabaseWriter as ConfectDatabaseWriter_,",
        );
        yield* cbw.writeLine(
          "ConfectMutationRunner as ConfectMutationRunner_,",
        );
        yield* cbw.writeLine("ConfectQueryRunner as ConfectQueryRunner_,");
        yield* cbw.writeLine("ConfectScheduler as ConfectScheduler_,");
        yield* cbw.writeLine("ConfectSchema,");
        yield* cbw.writeLine("ConfectStorage,");
        yield* cbw.writeLine("ConfectVectorSearch as ConfectVectorSearch_,");
        yield* cbw.writeLine("ConvexActionCtx as ConvexActionCtx_,");
        yield* cbw.writeLine("ConvexMutationCtx as ConvexMutationCtx_,");
        yield* cbw.writeLine("ConvexQueryCtx as ConvexQueryCtx_,");
      }),
    );
    yield* cbw.writeLine('} from "@rjdellecese/confect/server";');
    yield* cbw.writeLine(
      `import confectSchemaDefinition from "${schemaImportPath}";`,
    );
    yield* cbw.blankLine();

    // ConfectAuth
    yield* cbw.writeLine(
      "export const ConfectAuth = ConfectAuth_.ConfectAuth;",
    );
    yield* cbw.writeLine(
      "export type ConfectAuth = typeof ConfectAuth.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectScheduler
    yield* cbw.writeLine(
      "export const ConfectScheduler = ConfectScheduler_.ConfectScheduler;",
    );
    yield* cbw.writeLine(
      "export type ConfectScheduler = typeof ConfectScheduler.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectStorageReader
    yield* cbw.writeLine(
      "export const ConfectStorageReader = ConfectStorage.ConfectStorageReader;",
    );
    yield* cbw.writeLine(
      "export type ConfectStorageReader = typeof ConfectStorageReader.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectStorageWriter
    yield* cbw.writeLine(
      "export const ConfectStorageWriter = ConfectStorage.ConfectStorageWriter;",
    );
    yield* cbw.writeLine(
      "export type ConfectStorageWriter = typeof ConfectStorageWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectStorageActionWriter
    yield* cbw.writeLine("export const ConfectStorageActionWriter =");
    yield* cbw.indent(
      cbw.writeLine("ConfectStorage.ConfectStorageActionWriter;"),
    );
    yield* cbw.writeLine("export type ConfectStorageActionWriter =");
    yield* cbw.indent(
      cbw.writeLine("typeof ConfectStorageActionWriter.Identifier;"),
    );
    yield* cbw.blankLine();

    // ConfectVectorSearch
    yield* cbw.writeLine(
      "export const ConfectVectorSearch = ConfectVectorSearch_.ConfectVectorSearch;",
    );
    yield* cbw.writeLine(
      "export type ConfectVectorSearch = typeof ConfectVectorSearch.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectDatabaseReader
    yield* cbw.writeLine("export const ConfectDatabaseReader =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ConfectDatabaseReader_.ConfectDatabaseReader<");
        yield* cbw.indent(cbw.writeLine("typeof confectSchemaDefinition"));
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectDatabaseWriter
    yield* cbw.writeLine("export const ConfectDatabaseWriter =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ConfectDatabaseWriter_.ConfectDatabaseWriter<");
        yield* cbw.indent(cbw.writeLine("typeof confectSchemaDefinition"));
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectQueryRunner
    yield* cbw.writeLine(
      "export const ConfectQueryRunner = ConfectQueryRunner_.ConfectQueryRunner;",
    );
    yield* cbw.writeLine(
      "export type ConfectQueryRunner = typeof ConfectQueryRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectMutationRunner
    yield* cbw.writeLine("export const ConfectMutationRunner =");
    yield* cbw.indent(
      cbw.writeLine("ConfectMutationRunner_.ConfectMutationRunner;"),
    );
    yield* cbw.writeLine(
      "export type ConfectMutationRunner = typeof ConfectMutationRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // ConfectActionRunner
    yield* cbw.writeLine(
      "export const ConfectActionRunner = ConfectActionRunner_.ConfectActionRunner;",
    );
    yield* cbw.writeLine(
      "export type ConfectActionRunner = typeof ConfectActionRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // ConvexQueryCtx
    yield* cbw.writeLine("export const ConvexQueryCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ConvexQueryCtx_.ConvexQueryCtx<");
        yield* cbw.indent(
          Effect.gen(function* () {
            yield* cbw.writeLine(
              "ConfectSchema.DataModelFromConfectSchemaDefinition<",
            );
            yield* cbw.indent(cbw.writeLine("typeof confectSchemaDefinition"));
            yield* cbw.writeLine(">");
          }),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ConvexQueryCtx = typeof ConvexQueryCtx.Identifier;",
    );
    yield* cbw.blankLine();

    // ConvexMutationCtx
    yield* cbw.writeLine("export const ConvexMutationCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ConvexMutationCtx_.ConvexMutationCtx<");
        yield* cbw.indent(
          Effect.gen(function* () {
            yield* cbw.writeLine(
              "ConfectSchema.DataModelFromConfectSchemaDefinition<",
            );
            yield* cbw.indent(cbw.writeLine("typeof confectSchemaDefinition"));
            yield* cbw.writeLine(">");
          }),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ConvexMutationCtx = typeof ConvexMutationCtx.Identifier;",
    );
    yield* cbw.blankLine();

    // ConvexActionCtx
    yield* cbw.writeLine("export const ConvexActionCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ConvexActionCtx_.ConvexActionCtx<");
        yield* cbw.indent(
          Effect.gen(function* () {
            yield* cbw.writeLine(
              "ConfectSchema.DataModelFromConfectSchemaDefinition<",
            );
            yield* cbw.indent(cbw.writeLine("typeof confectSchemaDefinition"));
            yield* cbw.writeLine(">");
          }),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ConvexActionCtx = typeof ConvexActionCtx.Identifier;",
    );

    return yield* cbw.toString();
  });

class CodeBlockWriter {
  private readonly writer: CodeBlockWriter_;

  constructor(opts?: Partial<CodeBlockWriterOptions>) {
    this.writer = new CodeBlockWriter_(opts);
  }

  indent<E = never, R = never>(
    eff: Effect.Effect<void, E, R>,
  ): Effect.Effect<void, E, R> {
    return Effect.gen(this, function* () {
      const indentationLevel = this.writer.getIndentationLevel();
      this.writer.setIndentationLevel(indentationLevel + 1);
      yield* eff;
      this.writer.setIndentationLevel(indentationLevel);
    });
  }

  writeLine<E = never, R = never>(line: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.writeLine(line);
    });
  }

  write<E = never, R = never>(text: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.write(text);
    });
  }

  quote<E = never, R = never>(text: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.quote(text);
    });
  }

  conditionalWriteLine<E = never, R = never>(
    condition: boolean,
    text: string,
  ): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.conditionalWriteLine(condition, text);
    });
  }

  newLine<E = never, R = never>(): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.newLine();
    });
  }

  blankLine<E = never, R = never>(): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.blankLine();
    });
  }

  toString<E = never, R = never>(): Effect.Effect<string, E, R> {
    return Effect.sync(() => this.writer.toString());
  }
}
