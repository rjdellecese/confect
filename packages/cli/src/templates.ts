import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodeBlockWriter } from "./CodeBlockWriter";
import {
  collectImportBindings,
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
 * by impls and the per-group registries (and downstream by per-function
 * bundles for codec lookup). Every table wrapper at
 * `confect/_generated/tables/<name>.ts` is imported statically and
 * registered as a value entry on the `DatabaseSchema.make({...})` call.
 * Per-table laziness lives inside each `Table`: its `Fields`, `Doc`, and
 * `tableDefinition` are lazy memoised getters that only evaluate the
 * user-supplied field-schema callback on first access, so unused tables in
 * a function bundle never pay schema-construction cost despite the
 * static import.
 *
 * The `DatabaseSchema` import is aliased to `$DatabaseSchema` because each
 * table is imported under its own (filename-derived) name; a table named
 * `DatabaseSchema` would otherwise collide with the library import and emit
 * a duplicate-binding file. The leading `$` makes the alias collision-proof:
 * `validateConfectTableIdentifier` requires names to match
 * `/^[a-zA-Z][a-zA-Z0-9_]*$/`, which forbids `$`, so no valid table import
 * can ever shadow it.
 */
export const runtimeSchema = ({
  tableModules,
}: {
  tableModules: ReadonlyArray<TableModuleBinding>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import { DatabaseSchema as $DatabaseSchema } from "@confect/server";`,
    );

    if (tableModules.length > 0) {
      yield* cbw.blankLine();
      yield* Effect.forEach(tableModules, ({ tableName, importPath }) =>
        cbw.writeLine(`import ${tableName} from "${importPath}";`),
      );
    }

    yield* cbw.blankLine();

    if (tableModules.length === 0) {
      yield* cbw.writeLine(
        `const databaseSchema: $DatabaseSchema.DatabaseSchema = $DatabaseSchema.make({});`,
      );
    } else {
      yield* cbw.writeLine(
        `const databaseSchema: $DatabaseSchema.DatabaseSchema<`,
      );
      yield* cbw.indent(
        Effect.forEach(
          tableModules,
          ({ tableName }, i) =>
            cbw.writeLine(
              `typeof ${tableName}${i === tableModules.length - 1 ? "" : " |"}`,
            ),
          { discard: true },
        ),
      );
      yield* cbw.writeLine(`> = $DatabaseSchema.make({`);
      yield* cbw.indent(
        Effect.gen(function* () {
          for (const { tableName } of tableModules) {
            yield* cbw.writeLine(`${tableName},`);
          }
        }),
      );
      yield* cbw.writeLine(`});`);
    }

    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default databaseSchema;`);

    return yield* cbw.toString();
  });

/**
 * Emit `confect/_generated/convexSchema.ts` — the Convex deploy-time
 * `SchemaDefinition`. Imports every table from its generated wrapper at
 * `_generated/tables/<name>` and calls `defineSchema({...})` exactly once.
 * The file deliberately avoids any `@confect/server` import so that the
 * deploy artifact's import graph stays decoupled from the runtime
 * `DatabaseSchema` machinery.
 *
 * The `defineSchema` import is aliased to `$defineSchema` because each table
 * is imported under its own (filename-derived) name; a table named
 * `defineSchema` would otherwise collide with the library import and emit a
 * duplicate-binding file. The leading `$` makes the alias collision-proof:
 * `validateConfectTableIdentifier` requires names to match
 * `/^[a-zA-Z][a-zA-Z0-9_]*$/`, which forbids `$`, so no valid table import
 * can ever shadow it.
 */
export const convexSchema = ({
  tableModules,
}: {
  tableModules: ReadonlyArray<TableModuleBinding>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      `import { defineSchema as $defineSchema } from "convex/server";`,
    );

    if (tableModules.length > 0) {
      yield* cbw.blankLine();
      yield* Effect.forEach(tableModules, ({ tableName, importPath }) =>
        cbw.writeLine(`import ${tableName} from "${importPath}";`),
      );
    }

    yield* cbw.blankLine();

    if (tableModules.length === 0) {
      yield* cbw.writeLine(`export default $defineSchema({});`);
    } else {
      yield* cbw.writeLine(`export default $defineSchema({`);
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

/**
 * Emit `confect/_generated/components.ts` — a typed registry of the Convex
 * components installed via `app.use(...)` in `convex/convex.config.ts`.
 * Mirrors the `components` export of Convex's generated
 * `convex/_generated/api`: the runtime value is `componentsGeneric()` (a
 * name-preserving proxy), and each entry is typed with the `ComponentApi`
 * that component packages export from `_generated/component.js`. Unlike
 * `convex/_generated/api`, this file exists before `convex codegen` ever
 * runs, so impl modules can import it safely — `confect codegen` bundles and
 * evaluates each impl's import graph, and `convex/_generated/api` doesn't
 * exist yet at that point.
 *
 * The `as any` cast is confined here: `componentsGeneric()` is typed
 * `AnyChildComponents`, which deliberately doesn't overlap the precise
 * registry type; the `Components` annotation on the const supplies the
 * real type.
 */
export const components = ({
  components: installedComponents,
}: {
  components: ReadonlyArray<{ name: string; typeImportPath: string }>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { componentsGeneric } from "convex/server";`);
    yield* cbw.blankLine();

    if (installedComponents.length === 0) {
      yield* cbw.writeLine(`export type Components = {};`);
    } else {
      yield* cbw.writeLine(`export type Components = {`);
      yield* cbw.indent(
        Effect.forEach(
          installedComponents,
          ({ name, typeImportPath }) =>
            cbw.writeLine(
              `"${name}": import("${typeImportPath}/_generated/component.js").ComponentApi<"${name}">;`,
            ),
          { discard: true },
        ),
      );
      yield* cbw.writeLine(`};`);
    }
    yield* cbw.blankLine();

    yield* cbw.writeLine(
      `export const components: Components = componentsGeneric() as any;`,
    );

    return yield* cbw.toString();
  });

export const refs = ({ specImportPath }: { specImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Refs } from "@confect/core";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(
      `const refs: Refs.FromSpec<typeof spec> = Refs.make(spec);`,
    );
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default refs;`);

    return yield* cbw.toString();
  });

/**
 * Emit `_generated/docs.ts`: one named `type <table>` alias per table plus a
 * `Docs` registry. Each alias is `Document.Document<typeof schemaDefinition,
 * "<table>">`, so it stays structurally exact while giving the document a
 * *name* — declaration emit then prints e.g. `NotesDoc` instead of expanding
 * the row structure. A `type` alias (rather than an extending `interface`) is
 * used so it works for every document shape: object tables, but also union
 * schemas (`Schema.Union`) and other non-object documents, which an `interface
 * … extends` cannot represent (TS2312). The registry is threaded into the
 * generated `DatabaseReader`/`DatabaseWriter` tags so query/mutation helpers
 * print named documents with no user annotations.
 */
export const docs = ({
  schemaImportPath,
  tables,
}: {
  schemaImportPath: string;
  tables: ReadonlyArray<{ tableName: string; docName: string }>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    // With no tables there is nothing to import — emitting the (unused) imports
    // would trip `noUnusedLocals`.
    if (tables.length === 0) {
      yield* cbw.writeLine(`export interface Docs {}`);
      return yield* cbw.toString();
    }

    yield* cbw.writeLine(`import type { Document } from "@confect/server";`);
    yield* cbw.writeLine(
      `import type schemaDefinition from "${schemaImportPath}";`,
    );
    yield* cbw.blankLine();

    for (const { tableName, docName } of tables) {
      yield* cbw.writeLine(
        `export type ${docName} = Document.Document<typeof schemaDefinition, "${tableName}">;`,
      );
    }
    yield* cbw.blankLine();

    yield* cbw.writeLine(`export interface Docs {`);
    yield* cbw.indent(
      Effect.gen(function* () {
        for (const { tableName, docName } of tables) {
          yield* cbw.writeLine(`${tableName}: ${docName};`);
        }
      }),
    );
    yield* cbw.writeLine(`}`);

    return yield* cbw.toString();
  });

export const registeredFunctionsForGroup = ({
  schemaImportPath,
  specImportPath,
  implImportPath,
  layerExportName,
  useNode = false,
}: {
  schemaImportPath: string;
  specImportPath: string;
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

    yield* cbw.writeLine(`import databaseSchema from "${schemaImportPath}";`);
    yield* cbw.writeLine(`import ${layerExportName} from "${implImportPath}";`);
    yield* cbw.blankLine();
    // The group's own leaf spec is referenced type-only (`typeof import(...)`),
    // so the spec module is erased at transpile time and never enters the
    // per-function bundle; only `databaseSchema` and the impl are runtime
    // imports. Typing from the leaf spec (not the project-wide assembled spec)
    // keeps the registry's type dependent solely on its own group.
    const specType = `typeof import("${specImportPath}")["default"]`;
    const makeFn = useNode
      ? "RegisteredNodeFunction.make"
      : "RegisteredConvexFunction.make";
    yield* cbw.writeLine(
      `export default RegisteredFunctions.buildForGroup<${specType}>(databaseSchema, ${layerExportName}, ${makeFn});`,
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
    yield* cbw.writeLine(`import type { Docs } from "./docs";`);
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
    yield* cbw.writeLine(
      "export const VectorSearch: VectorSearch_.VectorSearchTag<",
    );
    yield* cbw.indent(
      cbw.writeLine("DataModel.FromSchema<typeof schemaDefinition>"),
    );
    yield* cbw.writeLine(
      "> = VectorSearch_.VectorSearch<DataModel.FromSchema<typeof schemaDefinition>>();",
    );
    yield* cbw.writeLine(
      "export type VectorSearch = typeof VectorSearch.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseReader
    yield* cbw.writeLine(
      "export const DatabaseReader: DatabaseReader_.DatabaseReaderTag<",
    );
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("typeof schemaDefinition,");
        yield* cbw.writeLine("Docs");
      }),
    );
    yield* cbw.writeLine(
      "> = DatabaseReader_.DatabaseReader<typeof schemaDefinition, Docs>();",
    );
    yield* cbw.writeLine(
      "export type DatabaseReader = typeof DatabaseReader.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseWriter
    yield* cbw.writeLine(
      "export const DatabaseWriter: DatabaseWriter_.DatabaseWriterTag<",
    );
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("typeof schemaDefinition,");
        yield* cbw.writeLine("Docs");
      }),
    );
    yield* cbw.writeLine(
      "> = DatabaseWriter_.DatabaseWriter<typeof schemaDefinition, Docs>();",
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
    yield* cbw.writeLine("export const QueryCtx: QueryCtx_.QueryCtxTag<");
    yield* cbw.indent(
      cbw.writeLine(
        "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
      ),
    );
    yield* cbw.writeLine("> = QueryCtx_.QueryCtx<");
    yield* cbw.indent(
      cbw.writeLine(
        "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
      ),
    );
    yield* cbw.writeLine(">();");
    yield* cbw.writeLine("export type QueryCtx = typeof QueryCtx.Identifier;");
    yield* cbw.blankLine();

    // MutationCtx
    yield* cbw.writeLine(
      "export const MutationCtx: MutationCtx_.MutationCtxTag<",
    );
    yield* cbw.indent(
      cbw.writeLine(
        "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
      ),
    );
    yield* cbw.writeLine("> = MutationCtx_.MutationCtx<");
    yield* cbw.indent(
      cbw.writeLine(
        "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
      ),
    );
    yield* cbw.writeLine(">();");
    yield* cbw.writeLine(
      "export type MutationCtx = typeof MutationCtx.Identifier;",
    );
    yield* cbw.blankLine();

    // ActionCtx
    yield* cbw.writeLine("export const ActionCtx: ActionCtx_.ActionCtxTag<");
    yield* cbw.indent(
      cbw.writeLine(
        "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
      ),
    );
    yield* cbw.writeLine("> = ActionCtx_.ActionCtx<");
    yield* cbw.indent(
      cbw.writeLine(
        "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
      ),
    );
    yield* cbw.writeLine(">();");
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

const groupTypeExpr = (node: SpecAssemblyNode): string => {
  const childUnion = Array.map(
    node.children,
    (child) => `GroupSpec.NamedAt<${groupTypeExpr(child)}, "${child.segment}">`,
  ).join(" | ");

  return Option.match(node.importBinding, {
    onNone: () =>
      `GroupSpec.GroupSpec<"Convex", "${node.segment}", never, ${childUnion}>`,
    onSome: (binding) =>
      node.children.length === 0
        ? `typeof ${binding.localName}`
        : `GroupSpec.AddGroups<typeof ${binding.localName}, ${childUnion}>`,
  });
};

const rootGroupTypeMember = (node: SpecAssemblyNode): string =>
  `GroupSpec.NamedAt<${groupTypeExpr(node)}, "${node.segment}">`;

export const assembledSpec = ({
  nodes,
}: {
  nodes: ReadonlyArray<SpecAssemblyNode>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(
      nodes.length > 0
        ? `import { GroupSpec, Spec } from "@confect/core";`
        : `import { Spec } from "@confect/core";`,
    );

    yield* Effect.forEach(collectImportBindings(nodes), (binding) =>
      cbw.writeLine(
        `import ${binding.localName} from "${binding.importPath}";`,
      ),
    );

    yield* cbw.blankLine();

    yield* cbw.write(`const spec: `);
    if (nodes.length === 0) {
      yield* cbw.write(`Spec.Spec`);
    } else {
      yield* cbw.write(`Spec.Spec<`);
      yield* cbw.newLine();
      yield* cbw.indent(
        Effect.gen(function* () {
          for (const node of nodes) {
            yield* cbw.writeLine(`| ${rootGroupTypeMember(node)}`);
          }
        }),
      );
      yield* cbw.write(`>`);
    }
    // The assembled spec is runtime-agnostic: a Node group's `makeNode()` is
    // already baked into its imported leaf spec, so the root is always
    // `Spec.make()` and binding-less container groups always use
    // `GroupSpec.makeAt` (containers register no functions and carry no runtime).
    yield* cbw.write(` = Spec.make()`);
    yield* Effect.forEach(nodes, (node) =>
      writeRootAddAt(cbw, node, "GroupSpec.makeAt"),
    );
    yield* cbw.write(";");
    yield* cbw.newLine();
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default spec;`);

    return yield* cbw.toString();
  });
