import type { Options as CodeBlockWriterOptions } from "code-block-writer";
import CodeBlockWriter_ from "code-block-writer";
import { Array, Effect } from "effect";
import type * as GroupPath from "./GroupPath";

export const functions = ({
  groupPath,
  functionNames,
  registeredFunctionsImportPath,
}: {
  groupPath: GroupPath.GroupPath;
  functionNames: string[];
  registeredFunctionsImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import registeredFunctions from "${registeredFunctionsImportPath}";`,
    );
    yield* cbw.newLine();
    for (const functionName of functionNames) {
      yield* cbw.writeLine(
        `export const ${functionName} = registeredFunctions.${Array.join([...groupPath.pathSegments, functionName], ".")};`,
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

export const convexConfig = ({ appImportPath }: { appImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import app from "${appImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default app;`);

    return yield* cbw.toString();
  });

export const crons = ({ cronsImportPath }: { cronsImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import crons from "${cronsImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default crons;`);

    return yield* cbw.toString();
  });

export const authConfig = ({ authImportPath }: { authImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import auth from "${authImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default auth;`);

    return yield* cbw.toString();
  });

export const refs = ({ specImportPath }: { specImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Refs } from "@confect/core";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default Refs.make(spec);`);

    return yield* cbw.toString();
  });

export const api = ({
  schemaImportPath,
  specImportPath,
}: {
  schemaImportPath: string;
  specImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Api } from "@confect/server";`);
    yield* cbw.writeLine(`import schema from "${schemaImportPath}";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default Api.make(schema, spec);`);

    return yield* cbw.toString();
  });

export const registeredFunctions = ({
  implImportPath,
}: {
  implImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import { RegisteredFunctions } from "@confect/server";`,
    );
    yield* cbw.writeLine(`import impl from "${implImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default RegisteredFunctions.make(impl);`);

    return yield* cbw.toString();
  });

export const services = ({ schemaImportPath }: { schemaImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    // Imports
    yield* cbw.writeLine("import {");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ActionCtx as ActionCtx_,");
        yield* cbw.writeLine("ActionRunner as ActionRunner_,");
        yield* cbw.writeLine("Auth as Auth_,");
        yield* cbw.writeLine("type DataModel,");
        yield* cbw.writeLine("DatabaseReader as DatabaseReader_,");
        yield* cbw.writeLine("DatabaseWriter as DatabaseWriter_,");
        yield* cbw.writeLine("MutationCtx as MutationCtx_,");
        yield* cbw.writeLine("MutationRunner as MutationRunner_,");
        yield* cbw.writeLine("QueryCtx as QueryCtx_,");
        yield* cbw.writeLine("QueryRunner as QueryRunner_,");
        yield* cbw.writeLine("Scheduler as Scheduler_,");
        yield* cbw.writeLine("Storage,");
        yield* cbw.writeLine("VectorSearch as VectorSearch_,");
      }),
    );
    yield* cbw.writeLine(`} from "@confect/server";`);
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
    yield* cbw.writeLine(
      "export const StorageActionWriter = Storage.StorageActionWriter;",
    );
    yield* cbw.writeLine(
      "export type StorageActionWriter = typeof StorageActionWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // VectorSearch
    yield* cbw.writeLine("export const VectorSearch =");
    yield* cbw.indent(
      cbw.writeLine(
        "VectorSearch_.VectorSearch<DataModel.FromSchema<typeof schemaDefinition>>();",
      ),
    );
    yield* cbw.writeLine(
      "export type VectorSearch = typeof VectorSearch.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseReader
    yield* cbw.writeLine("export const DatabaseReader =");
    yield* cbw.indent(
      cbw.writeLine(
        "DatabaseReader_.DatabaseReader<typeof schemaDefinition>();",
      ),
    );
    yield* cbw.writeLine(
      "export type DatabaseReader = typeof DatabaseReader.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseWriter
    yield* cbw.writeLine("export const DatabaseWriter =");
    yield* cbw.indent(
      cbw.writeLine(
        "DatabaseWriter_.DatabaseWriter<typeof schemaDefinition>();",
      ),
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
    yield* cbw.writeLine(
      "export const MutationRunner = MutationRunner_.MutationRunner;",
    );
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
          cbw.writeLine(
            "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
          ),
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
          cbw.writeLine(
            "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
          ),
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
          cbw.writeLine(
            "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
          ),
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
