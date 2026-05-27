import { Array, Effect, Option } from "effect";
import { CodeBlockWriter } from "./CodeBlockWriter";
import {
  collectImportBindings,
  collectLeafPaths,
  type SpecAssemblyNode,
} from "./SpecAssemblyNode";

export const functions = ({
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: {
  functionNames: string[];
  registeredFunctionsImportPath: string;
  useNode?: boolean;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    if (useNode) {
      yield* cbw.writeLine(`"use node";`);
      yield* cbw.blankLine();
    }

    yield* cbw.writeLine(
      `import registeredFunctions from "${registeredFunctionsImportPath}";`,
    );
    yield* cbw.newLine();
    yield* Effect.forEach(functionNames, (functionName) =>
      cbw.writeLine(
        `export const ${functionName} = registeredFunctions.${functionName};`,
      ),
    );

    return yield* cbw.toString();
  });

/**
 * Emit `convex/schema.ts` as a one-line re-export of the codegen-emitted
 * deploy schema in `confect/_generated/convexSchema.ts`. Deploy-time
 * consumers (the Convex CLI, `convex-test`) keep reading
 * `convex/schema.ts`; the runtime `DatabaseSchema` in
 * `confect/_generated/schema.ts` is untouched by this file.
 */
export const schema = ({
  convexSchemaImportPath,
}: {
  convexSchemaImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `export { default } from "${convexSchemaImportPath}";`,
    );

    return yield* cbw.toString();
  });

interface TableModuleBinding {
  readonly importPath: string;
  readonly tableName: string;
}

/**
 * Emit `confect/_generated/schema.ts` — the runtime `DatabaseSchema` used
 * by `_generated/api.ts` (and downstream by per-function bundles for codec
 * lookup). Imports every table from its generated wrapper at
 * `_generated/tables/<name>` and chains them onto a fresh
 * `DatabaseSchema.make()`. The file deliberately avoids any `convex/server`
 * import so that runtime bundles never pull in `defineSchema(...)`.
 */
export const runtimeSchema = ({
  tableModules,
}: {
  tableModules: ReadonlyArray<TableModuleBinding>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { DatabaseSchema } from "@confect/server";`);

    if (tableModules.length > 0) {
      yield* cbw.blankLine();
      yield* Effect.forEach(tableModules, ({ tableName, importPath }) =>
        cbw.writeLine(`import ${tableName} from "${importPath}";`),
      );
    }

    yield* cbw.blankLine();

    if (tableModules.length === 0) {
      yield* cbw.writeLine(`export default DatabaseSchema.make();`);
    } else {
      yield* cbw.writeLine(`export default DatabaseSchema.make()`);
      yield* cbw.indent(
        Effect.gen(function* () {
          for (const [index, { tableName }] of tableModules.entries()) {
            const isLast = index === tableModules.length - 1;
            yield* cbw.writeLine(`.addTable(${tableName})${isLast ? ";" : ""}`);
          }
        }),
      );
    }

    return yield* cbw.toString();
  });

/**
 * Emit `confect/_generated/convexSchema.ts` — the Convex deploy-time
 * `SchemaDefinition`. Imports every table from its generated wrapper at
 * `_generated/tables/<name>` and calls `defineSchema({...})` exactly once.
 * The file deliberately avoids any `@confect/server` import so that the
 * deploy artifact's import graph stays decoupled from the runtime
 * `DatabaseSchema` machinery.
 */
export const convexSchema = ({
  tableModules,
}: {
  tableModules: ReadonlyArray<TableModuleBinding>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { defineSchema } from "convex/server";`);

    if (tableModules.length > 0) {
      yield* cbw.blankLine();
      yield* Effect.forEach(tableModules, ({ tableName, importPath }) =>
        cbw.writeLine(`import ${tableName} from "${importPath}";`),
      );
    }

    yield* cbw.blankLine();

    if (tableModules.length === 0) {
      yield* cbw.writeLine(`export default defineSchema({});`);
    } else {
      yield* cbw.writeLine(`export default defineSchema({`);
      yield* cbw.indent(
        Effect.gen(function* () {
          for (const { tableName } of tableModules) {
            yield* cbw.writeLine(`${tableName}: ${tableName}.tableDefinition,`);
          }
        }),
      );
      yield* cbw.writeLine(`});`);
    }

    return yield* cbw.toString();
  });

/**
 * Emit `confect/_generated/id.ts` — a type-constrained `Id` constructor and
 * a `TableNames` union derived from the user's `confect/tables/*.ts`
 * filenames. User-authored table modules import `Id` from this file to
 * declare cross-table id references without typing the destination name as
 * a free string (and without ever importing each other transitively).
 *
 * When the table directory is empty the `TableNames` union resolves to
 * `never`, which still lets the file typecheck against an empty workspace.
 */
export const id = ({ tableNames }: { tableNames: ReadonlyArray<string> }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { GenericId } from "@confect/core";`);
    yield* cbw.blankLine();

    const union =
      tableNames.length === 0
        ? "never"
        : tableNames.map((n) => `"${n}"`).join(" | ");
    yield* cbw.writeLine(`export type TableNames = ${union};`);
    yield* cbw.blankLine();

    yield* cbw.writeLine(
      `export const Id = <const TableName extends TableNames>(`,
    );
    yield* cbw.indent(cbw.writeLine(`tableName: TableName,`));
    yield* cbw.writeLine(`) => GenericId.GenericId(tableName);`);

    return yield* cbw.toString();
  });

/**
 * Emit `confect/_generated/tables/<tableName>.ts` — a two-line wrapper that
 * imports the user-authored `UnnamedTable` and binds the file basename to
 * it, producing the fully-named `Table` value that downstream consumers
 * (schema, specs, impls) read.
 */
export const tableWrapper = ({
  tableName,
  unnamedImportPath,
}: {
  tableName: string;
  unnamedImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import unnamed from "${unnamedImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default unnamed("${tableName}");`);

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

export const crons = ({ cronsImportPath }: { cronsImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import crons from "${cronsImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default crons.convexCronJobs;`);

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

export const refs = ({
  specImportPath,
  nodeSpecImportPath,
}: {
  specImportPath: string;
  nodeSpecImportPath: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Refs } from "@confect/core";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* Option.match(nodeSpecImportPath, {
      onNone: () => Effect.void,
      onSome: (nodeSpecImportPath_) =>
        cbw.writeLine(`import nodeSpec from "${nodeSpecImportPath_}";`),
    });
    yield* cbw.blankLine();
    yield* cbw.writeLine(
      Option.match(nodeSpecImportPath, {
        onSome: () => `export default Refs.make(spec, nodeSpec);`,
        onNone: () => `export default Refs.make(spec);`,
      }),
    );

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

export const nodeApi = ({
  schemaImportPath,
  nodeSpecImportPath,
}: {
  schemaImportPath: string;
  nodeSpecImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Api } from "@confect/server";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`import schema from "${schemaImportPath}";`);
    yield* cbw.writeLine(`import nodeSpec from "${nodeSpecImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default Api.make(schema, nodeSpec);`);

    return yield* cbw.toString();
  });

export const registeredFunctionsForGroup = ({
  apiImportPath,
  groupPathDot,
  implImportPath,
  layerExportName,
  useNode = false,
}: {
  apiImportPath: string;
  groupPathDot: string;
  implImportPath: string;
  layerExportName: string;
  useNode?: boolean;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    if (useNode) {
      yield* cbw.writeLine(
        `import { RegisteredFunctions } from "@confect/server";`,
      );
      yield* cbw.writeLine(
        `import { RegisteredNodeFunction } from "@confect/server/node";`,
      );
    } else {
      yield* cbw.writeLine(
        `import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";`,
      );
    }

    yield* cbw.writeLine(`import api from "${apiImportPath}";`);
    yield* cbw.writeLine(`import ${layerExportName} from "${implImportPath}";`);
    yield* cbw.blankLine();
    const quotedGroupPath = `"${groupPathDot.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    yield* cbw.writeLine(
      useNode
        ? `export default RegisteredFunctions.buildForGroup(api, ${quotedGroupPath}, ${layerExportName}, RegisteredNodeFunction.make);`
        : `export default RegisteredFunctions.buildForGroup(api, ${quotedGroupPath}, ${layerExportName}, RegisteredConvexFunction.make);`,
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
        yield* cbw.writeLine("StorageActionWriter as StorageActionWriter_,");
        yield* cbw.writeLine("StorageReader as StorageReader_,");
        yield* cbw.writeLine("StorageWriter as StorageWriter_,");
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
    yield* cbw.writeLine(
      "export const StorageReader = StorageReader_.StorageReader;",
    );
    yield* cbw.writeLine(
      "export type StorageReader = typeof StorageReader.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageWriter
    yield* cbw.writeLine(
      "export const StorageWriter = StorageWriter_.StorageWriter;",
    );
    yield* cbw.writeLine(
      "export type StorageWriter = typeof StorageWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageActionWriter
    yield* cbw.writeLine(
      "export const StorageActionWriter = StorageActionWriter_.StorageActionWriter;",
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

const writeChildAddGroupAt = (
  cbw: CodeBlockWriter,
  child: SpecAssemblyNode,
  groupFactory: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* cbw.write(".addGroupAt(");
    yield* cbw.quote(child.segment);
    yield* cbw.write(", ");
    yield* writeGroupAssembly(cbw, child, groupFactory);
    yield* cbw.write(")");
  });

const writeGroupFactoryCall = (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
  groupFactory: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* cbw.write(groupFactory);
    yield* cbw.write("(");
    yield* cbw.quote(node.segment);
    yield* cbw.write(")");

    yield* Effect.forEach(node.children, (child) =>
      writeChildAddGroupAt(cbw, child, groupFactory),
    );
  });

const writeGroupAssembly: (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
  groupFactory: string,
) => Effect.Effect<void> = (cbw, node, groupFactory) =>
  Option.match(node.importBinding, {
    onNone: () => writeGroupFactoryCall(cbw, node, groupFactory),
    onSome: (binding) =>
      Effect.gen(function* () {
        yield* cbw.write(binding.localName);
        yield* Effect.forEach(node.children, (child) =>
          writeChildAddGroupAt(cbw, child, groupFactory),
        );
      }),
  });

const writeRootAddAt = (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
  groupFactory: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* cbw.write(".addAt(");
    yield* cbw.quote(node.segment);
    yield* cbw.write(", ");

    yield* writeGroupAssembly(cbw, node, groupFactory);

    yield* cbw.write(")");
  });

export const assembledSpec = ({
  nodes,
  runtime,
}: {
  nodes: ReadonlyArray<SpecAssemblyNode>;
  runtime: "Convex" | "Node";
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    const nodeRequiresGroupFactory = (node: SpecAssemblyNode): boolean =>
      Option.isNone(node.importBinding) ||
      Array.some(node.children, nodeRequiresGroupFactory);

    const needsGroupSpec = Array.some(nodes, nodeRequiresGroupFactory);
    yield* cbw.writeLine(
      needsGroupSpec
        ? `import { GroupSpec, Spec } from "@confect/core";`
        : `import { Spec } from "@confect/core";`,
    );

    yield* Effect.forEach(collectImportBindings(nodes), (binding) =>
      cbw.writeLine(
        `import ${binding.localName} from "${binding.importPath}";`,
      ),
    );

    yield* cbw.blankLine();

    const specFactory =
      runtime === "Convex" ? "Spec.make()" : "Spec.makeNode()";
    const groupFactory =
      runtime === "Convex" ? "GroupSpec.makeAt" : "GroupSpec.makeNodeAt";

    yield* cbw.write(`export default ${specFactory}`);
    yield* Effect.forEach(collectLeafPaths(nodes), (leaf) =>
      Effect.gen(function* () {
        yield* cbw.write(`.addPath(${leaf.binding.localName}, `);
        yield* cbw.quote(leaf.dotPath);
        yield* cbw.write(")");
      }),
    );
    yield* Effect.forEach(nodes, (node) =>
      writeRootAddAt(cbw, node, groupFactory),
    );
    yield* cbw.write(";");
    yield* cbw.newLine();

    return yield* cbw.toString();
  });
