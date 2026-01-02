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

    yield* cbw.writeLine(`import schemaDefinition from "${schemaImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(
      `export default schemaDefinition.convexSchemaDefinition;`,
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

    yield* cbw.writeLine(`import { Refs } from "@rjdellecese/confect";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`const refs = Refs.make(spec);`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export const api = Refs.justPublic(refs);`);
    yield* cbw.writeLine(`export const internal = Refs.justInternal(refs);`);

    return yield* cbw.toString();
  });

export const api = ({
  schemaImportPath,
  specImportPath,
  test,
}: {
  schemaImportPath: string;
  specImportPath: string;
  test?: boolean;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import { Api } from "${test ? "../../../src/index" : "@rjdellecese/confect"}";`,
    );
    yield* cbw.writeLine(`import schema from "${schemaImportPath}";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default Api.make(schema, spec);`);

    return yield* cbw.toString();
  });

export const services = ({
  schemaImportPath,
  test,
}: {
  schemaImportPath: string;
  test?: boolean;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    // Imports
    yield* cbw.writeLine(
      `import type { DataModel } from "${test ? "../../../src/index" : "@rjdellecese/confect"}";`,
    );
    yield* cbw.writeLine("import {");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ActionRunner as ActionRunner_,");
        yield* cbw.writeLine("Auth as Auth_,");
        yield* cbw.writeLine("DatabaseReader as DatabaseReader_,");
        yield* cbw.writeLine("DatabaseWriter as DatabaseWriter_,");
        yield* cbw.writeLine("MutationRunner as MutationRunner_,");
        yield* cbw.writeLine("QueryRunner as QueryRunner_,");
        yield* cbw.writeLine("Scheduler as Scheduler_,");
        yield* cbw.writeLine("Storage,");
        yield* cbw.writeLine("VectorSearch as VectorSearch_,");
        yield* cbw.writeLine("ActionCtx as ActionCtx_,");
        yield* cbw.writeLine("MutationCtx as MutationCtx_,");
        yield* cbw.writeLine("QueryCtx as QueryCtx_,");
      }),
    );
    yield* cbw.writeLine(
      `} from "${test ? "../../../src/index" : "@rjdellecese/confect"}";`,
    );
    yield* cbw.writeLine(
      `import type schemaDefinition from "${schemaImportPath}";`,
    );
    yield* cbw.blankLine();

    // Auth
    yield* cbw.writeLine("export const Auth = Auth_.Auth;");
    yield* cbw.writeLine("export type Auth = typeof Auth.Identifier;");
    yield* cbw.blankLine();

    // Scheduler
    yield* cbw.writeLine("export const Scheduler = Scheduler_.Scheduler;");
    yield* cbw.writeLine(
      "export type Scheduler = typeof Scheduler.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageReader
    yield* cbw.writeLine("export const StorageReader = Storage.StorageReader;");
    yield* cbw.writeLine(
      "export type StorageReader = typeof StorageReader.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageWriter
    yield* cbw.writeLine("export const StorageWriter = Storage.StorageWriter;");
    yield* cbw.writeLine(
      "export type StorageWriter = typeof StorageWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageActionWriter
    yield* cbw.writeLine("export const StorageActionWriter =");
    yield* cbw.indent(cbw.writeLine("Storage.StorageActionWriter;"));
    yield* cbw.writeLine("export type StorageActionWriter =");
    yield* cbw.indent(cbw.writeLine("typeof StorageActionWriter.Identifier;"));
    yield* cbw.blankLine();

    // VectorSearch
    yield* cbw.writeLine("export const VectorSearch =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("VectorSearch_.VectorSearch<");
        yield* cbw.indent(
          cbw.writeLine("DataModel.FromSchema<typeof schemaDefinition>"),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type VectorSearch = typeof VectorSearch.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseReader
    yield* cbw.writeLine("export const DatabaseReader =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("DatabaseReader_.DatabaseReader<");
        yield* cbw.indent(cbw.writeLine("typeof schemaDefinition"));
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type DatabaseReader = typeof DatabaseReader.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseWriter
    yield* cbw.writeLine("export const DatabaseWriter =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("DatabaseWriter_.DatabaseWriter<");
        yield* cbw.indent(cbw.writeLine("typeof schemaDefinition"));
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type DatabaseWriter = typeof DatabaseWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // QueryRunner
    yield* cbw.writeLine(
      "export const QueryRunner = QueryRunner_.QueryRunner;",
    );
    yield* cbw.writeLine(
      "export type QueryRunner = typeof QueryRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // MutationRunner
    yield* cbw.writeLine("export const MutationRunner =");
    yield* cbw.indent(cbw.writeLine("MutationRunner_.MutationRunner;"));
    yield* cbw.writeLine(
      "export type MutationRunner = typeof MutationRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // ActionRunner
    yield* cbw.writeLine(
      "export const ActionRunner = ActionRunner_.ActionRunner;",
    );
    yield* cbw.writeLine(
      "export type ActionRunner = typeof ActionRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // QueryCtx
    yield* cbw.writeLine("export const QueryCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("QueryCtx_.QueryCtx<");
        yield* cbw.indent(
          Effect.gen(function* () {
            yield* cbw.writeLine("DataModel.ToConvex<");
            yield* cbw.indent(
              Effect.gen(function* () {
                yield* cbw.writeLine("DataModel.FromSchema<");
                yield* cbw.indent(cbw.writeLine("typeof schemaDefinition"));
                yield* cbw.writeLine(">");
              }),
            );
            yield* cbw.writeLine(">");
          }),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine("export type QueryCtx = typeof QueryCtx.Identifier;");
    yield* cbw.blankLine();

    // MutationCtx
    yield* cbw.writeLine("export const MutationCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("MutationCtx_.MutationCtx<");
        yield* cbw.indent(
          Effect.gen(function* () {
            yield* cbw.writeLine("DataModel.ToConvex<");
            yield* cbw.indent(
              Effect.gen(function* () {
                yield* cbw.writeLine("DataModel.FromSchema<");
                yield* cbw.indent(cbw.writeLine("typeof schemaDefinition"));
                yield* cbw.writeLine(">");
              }),
            );
            yield* cbw.writeLine(">");
          }),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type MutationCtx = typeof MutationCtx.Identifier;",
    );
    yield* cbw.blankLine();

    // ActionCtx
    yield* cbw.writeLine("export const ActionCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ActionCtx_.ActionCtx<");
        yield* cbw.indent(
          Effect.gen(function* () {
            yield* cbw.writeLine("DataModel.ToConvex<");
            yield* cbw.indent(
              Effect.gen(function* () {
                yield* cbw.writeLine("DataModel.FromSchema<");
                yield* cbw.indent(cbw.writeLine("typeof schemaDefinition"));
                yield* cbw.writeLine(">");
              }),
            );
            yield* cbw.writeLine(">");
          }),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ActionCtx = typeof ActionCtx.Identifier;",
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
