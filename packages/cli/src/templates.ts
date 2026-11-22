import * as Record from "effect/Record";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import { CodeBlockWriter } from "./CodeBlockWriter";
import {
  render as renderSpecAssembly,
  type SpecAssemblyNode,
} from "./SpecAssemblyNode";

/**
 * Emit `convex/schema.ts` as a one-line re-export of the codegen-emitted deploy
 * schema in `confect/_generated/convexSchema.ts`. Deploy-time consumers (the
 * Convex CLI, `convex-test`) keep reading `convex/schema.ts`; the runtime
 * `DatabaseSchema` in `confect/_generated/schema.ts` is untouched by this
 * file.
 */
export const schema = ({
  convexSchemaImportPath,
}: Parameters<typeof schemaEffect>[0]) =>
  schemaEffect({ convexSchemaImportPath });

const schemaEffect = Effect.fnUntraced(function* ({
  convexSchemaImportPath,
}: {
  convexSchemaImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`/**
 * Deployment schema that the Convex CLI and \`convex-test\` read from
 * \`convex/schema.ts\`.
 *
 * **Gotchas**
 *
 * Importing this schema constructs validators for every application table. Keep it
 * out of function runtime code.
 *
 * @category schemas
 */`);
  yield* cbw.writeLine(`export { default } from "${convexSchemaImportPath}";`);

  return yield* cbw.toString();
});

interface TableModuleBinding {
  readonly importPath: string;
  readonly tableName: string;
}

/**
 * Emit the opt-in registry of all application tables. Generated services and
 * document aliases use its type; function modules import individual handles.
 */
export const runtimeSchema = ({
  tableModules,
}: Parameters<typeof runtimeSchemaEffect>[0]) =>
  runtimeSchemaEffect({ tableModules });

const runtimeSchemaEffect = Effect.fnUntraced(function* ({
  tableModules,
}: {
  tableModules: ReadonlyArray<TableModuleBinding>;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(
    `import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";`,
  );

  if (tableModules.length > 0) {
    yield* cbw.blankLine();
    yield* Effect.forEach(
      tableModules,
      ({ tableName, importPath }) =>
        cbw.writeLine(`import ${tableName}Table from "${importPath}";`),
      { concurrency: 1 },
    );
  }

  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Registry of all application table handles. Import its type when a service or
 * helper needs the full database model.
 *
 * **Gotchas**
 *
 * A value import loads every table module. In handlers, import individual handles
 * from \`_generated/tables\` instead.
 *
 * @category schemas
 */`);
  if (tableModules.length === 0) {
    yield* cbw.writeLine(
      `const databaseSchema: DatabaseSchema_.DatabaseSchema = DatabaseSchema_.make({});`,
    );
  } else {
    yield* cbw.writeLine(
      `const databaseSchema: DatabaseSchema_.DatabaseSchema<{`,
    );
    yield* cbw.indent(
      Effect.forEach(
        tableModules,
        ({ tableName }) =>
          cbw.writeLine(`readonly ${tableName}: typeof ${tableName}Table;`),
        { concurrency: 1, discard: true },
      ),
    );
    yield* cbw.writeLine(`}> = DatabaseSchema_.make({`);
    yield* cbw.indent(
      Effect.gen(function* () {
        for (const { tableName } of tableModules) {
          yield* cbw.writeLine(`${tableName}: ${tableName}Table,`);
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
 * Emit `confect/_generated/convexSchema.ts`—the Convex deploy-time
 * `SchemaDefinition`. Imports every table from its generated wrapper at
 * `_generated/tables/<name>` and calls `defineSchema({...})` exactly once.
 * `Table.tableDefinition` lives in `@confect/server` because it is the
 * `defineTable` binding; the generated table wrappers themselves stay
 * client-safe (`Fields`/`Doc` from `@confect/core`).
 */
export const convexSchema = ({
  tableModules,
}: Parameters<typeof convexSchemaEffect>[0]) =>
  convexSchemaEffect({ tableModules });

const convexSchemaEffect = Effect.fnUntraced(function* ({
  tableModules,
}: {
  tableModules: ReadonlyArray<TableModuleBinding>;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(
    `import { defineSchema as defineSchema_ } from "convex/server";`,
  );

  if (tableModules.length > 0) {
    yield* cbw.writeLine(`import { Table as Table_ } from "@confect/server";`);
    yield* cbw.blankLine();
    yield* Effect.forEach(
      tableModules,
      ({ tableName, importPath }) =>
        cbw.writeLine(`import ${tableName}Table from "${importPath}";`),
      { concurrency: 1 },
    );
  }

  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Convex schema containing the validators and indexes for every application table.
 * Use it for deployment or pass it to the test backend.
 *
 * **Gotchas**
 *
 * Importing this module constructs every table's deployment definition. Import
 * individual handles from \`_generated/tables\` in function implementations.
 *
 * @category schemas
 */`);
  if (tableModules.length === 0) {
    yield* cbw.writeLine(`export default defineSchema_({});`);
  } else {
    yield* cbw.writeLine(`export default defineSchema_({`);
    yield* cbw.indent(
      Effect.gen(function* () {
        for (const { tableName } of tableModules) {
          yield* cbw.writeLine(
            `${tableName}: Table_.tableDefinition(${tableName}Table),`,
          );
        }
      }),
    );
    yield* cbw.writeLine(`});`);
  }

  return yield* cbw.toString();
});

export const tableNames = (names: ReadonlyArray<string>) =>
  `/**
 * Names of the application's declared tables, excluding Convex system tables. Use
 * this list in test setup to supply table names without importing their schemas.
 *
 * @category constants
 */
export default [${Array.join(
    Array.map(names, (name) => `"${name}"`),
    ", ",
  )}] as const;\n`;

export const serverBuilders = `import * as FunctionImpl_ from "@confect/server/FunctionImpl";
import * as MiddlewareImpl_ from "@confect/server/MiddlewareImpl";
import type schema from "./schema";

/**
 * Builders for a group's implementation layer. Start with
 * \`GroupImpl.make(groupSpec)\`, provide the function and middleware layers, then
 * call \`GroupImpl.finalize\` to check completeness.
 *
 * @category re-exports
 */
export * as GroupImpl from "@confect/server/GroupImpl";
/**
 * Builder for a function implementation layer. Pass the group spec, function name,
 * and handler to \`FunctionImpl.make\`. The handler receives decoded arguments and
 * services typed to this application's database.
 *
 * @category constructors
 */
export const FunctionImpl = FunctionImpl_.forSchema<typeof schema>();
/**
 * Builders for middleware implementation layers typed to this application's
 * database. Use \`make\` to share an implementation, \`makeByFunctionType\` for
 * distinct handlers, or \`provides\` to supply the service declared by the
 * middleware spec.
 *
 * @category constructors
 */
export const MiddlewareImpl = MiddlewareImpl_.forSchema<typeof schema>();
`;

/**
 * Emit `confect/_generated/id.ts`—a type-constrained `Id` constructor and a
 * `TableNames` union derived from the user's `confect/tables/*.ts` filenames.
 * User-authored table modules import `Id` from this file to declare cross-table
 * id references without typing the destination name as a free string (and
 * without ever importing each other transitively).
 *
 * When the table directory is empty the `TableNames` union resolves to `never`,
 * which still lets the file typecheck against an empty workspace.
 */
export const id = `import * as GenericId from "@confect/core/GenericId";
import type { SystemTableNames } from "convex/server";
import type tableNames from "./tableNames.js";

/**
 * Union of application table names, excluding Convex system tables. If the
 * application declares no tables, the type is \`never\`.
 *
 * @category models
 */
export type TableNames = (typeof tableNames)[number];

/**
 * Convex document ID branded with its application or system table name. The brand
 * distinguishes IDs in TypeScript; it does not prove a document exists.
 *
 * @category models
 */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName>;

/**
 * Creates an Effect schema for a table's document IDs without importing the table.
 *
 * **Gotchas**
 *
 * Decoding accepts any string. It does not check the ID's format, table
 * membership, or existence. Use the generated \`DocumentIds\` service in queries or
 * mutations to validate table membership.
 *
 * @param tableName - An application or Convex system table name.
 * @returns A schema whose decoded and encoded types are \`Id<TableName>\`.
 * @category schemas
 */
export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
`;

/**
 * Emit `confect/_generated/tables/<tableName>.ts`—a two-line wrapper that
 * imports the user-authored `UnnamedTable` and binds the file basename to it,
 * producing the fully-named `Table` value that downstream consumers (schema,
 * specs, impls) read.
 */
export const tableWrapper = ({
  tableName,
  unnamedImportPath,
}: Parameters<typeof tableWrapperEffect>[0]) =>
  tableWrapperEffect({ tableName, unnamedImportPath });

const tableWrapperEffect = Effect.fnUntraced(function* ({
  tableName,
  unnamedImportPath,
}: {
  tableName: string;
  unnamedImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import ${tableName}Table from "${unnamedImportPath}";`);
  yield* cbw.blankLine();
  yield* cbw.writeLine(`/**
 * Table handle for \`${tableName}\`. Pass it to \`reader.table\` or \`writer.table\` to
 * select this table without loading other application tables.
 *
 * **Details**
 *
 * \`Fields\` describes the user-defined fields; \`Doc\` also includes \`_id\` and
 * \`_creationTime\`. Importing the handle does not evaluate its field-schema
 * callback.
 *
 * @category schemas
 */`);
  yield* cbw.writeLine(`export default ${tableName}Table("${tableName}");`);

  return yield* cbw.toString();
});

export const http = ({ httpImportPath }: Parameters<typeof httpEffect>[0]) =>
  httpEffect({ httpImportPath });

const httpEffect = Effect.fnUntraced(function* ({
  httpImportPath,
}: {
  httpImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import http from "${httpImportPath}";`);
  yield* cbw.newLine();
  yield* cbw.writeLine(
    `/**
 * HTTP router that registers the application's HTTP routes with Convex.
 *
 * @category configuration
 */`,
  );
  yield* cbw.writeLine(`export default http;`);

  return yield* cbw.toString();
});

export const crons = ({ cronsImportPath }: Parameters<typeof cronsEffect>[0]) =>
  cronsEffect({ cronsImportPath });

const cronsEffect = Effect.fnUntraced(function* ({
  cronsImportPath,
}: {
  cronsImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import crons from "${cronsImportPath}";`);
  yield* cbw.newLine();
  yield* cbw.writeLine(
    `/**
 * Cron jobs that Convex runs according to the application's recurring schedules.
 *
 * @category configuration
 */`,
  );
  yield* cbw.writeLine(`export default crons.convexCronJobs;`);

  return yield* cbw.toString();
});

export const authConfig = ({
  authImportPath,
}: Parameters<typeof authConfigEffect>[0]) =>
  authConfigEffect({ authImportPath });

const authConfigEffect = Effect.fnUntraced(function* ({
  authImportPath,
}: {
  authImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import auth from "${authImportPath}";`);
  yield* cbw.newLine();
  yield* cbw.writeLine(
    `/**
 * Authentication provider configuration that Convex uses to verify caller
 * identities.
 *
 * @category configuration
 */`,
  );
  yield* cbw.writeLine(`export default auth;`);

  return yield* cbw.toString();
});

/**
 * Emit `confect/_generated/components.ts`—a typed registry of the Convex
 * components installed via `app.use(...)` in `convex/convex.config.ts`. Mirrors
 * the `components` export of Convex's generated `convex/_generated/api`: the
 * runtime value is `componentsGeneric()` (a name-preserving proxy), and each
 * entry is typed with the `ComponentApi` that component packages export from
 * `_generated/component.js`. Unlike `convex/_generated/api`, this file exists
 * before `convex codegen` ever runs, so impl modules can import it
 * safely—`confect codegen` bundles and evaluates each impl's import graph, and
 * `convex/_generated/api` doesn't exist yet at that point.
 *
 * The `as any` cast is confined here: `componentsGeneric()` is typed
 * `AnyChildComponents`, which deliberately doesn't overlap the precise registry
 * type; the `Components` annotation on the const supplies the real type.
 */
export const components = ({
  components: installedComponents,
}: Parameters<typeof componentsEffect>[0]) =>
  componentsEffect({ components: installedComponents });

const componentsEffect = Effect.fnUntraced(function* ({
  components: installedComponents,
}: {
  components: ReadonlyArray<{ name: string; typeImportPath: string }>;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import { componentsGeneric } from "convex/server";`);
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/**
 * Map from installed component names to their typed \`ComponentApi\` function
 * references.
 *
 * @category models
 */`,
  );
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
        { concurrency: 1, discard: true },
      ),
    );
    yield* cbw.writeLine(`};`);
  }
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/**
 * Function references for the components installed with \`app.use\` in
 * \`convex/convex.config.ts\`. Select a component by its installed name, then pass a
 * reference to a Convex component API or native context.
 *
 * **Details**
 *
 * The registry is available before Convex code generation. Reading a reference
 * does not invoke the component function.
 *
 * @category references
 */`,
  );
  yield* cbw.writeLine(
    `export const components: Components = componentsGeneric() as any;`,
  );

  return yield* cbw.toString();
});

export const refs = ({ specImportPath }: Parameters<typeof refsEffect>[0]) =>
  refsEffect({ specImportPath });

const refsEffect = Effect.fnUntraced(function* ({
  specImportPath,
}: {
  specImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import { Refs } from "@confect/core";`);
  yield* cbw.writeLine(`import spec from "${specImportPath}";`);
  yield* cbw.blankLine();
  yield* cbw.writeLine(`/**
 * Typed function references grouped by path and function name. Pass a leaf
 * reference to a Confect client, runner, or scheduler rather than calling it
 * directly.
 *
 * **Details**
 *
 * The \`public\` view exposes client-callable references and \`internal\` exposes
 * server-only references. Each carries its argument, result, and declared error
 * types; Confect evaluates codecs lazily.
 *
 * **Gotchas**
 *
 * The views filter references at the type level. Convex enforces visibility on the
 * deployed functions.
 *
 * @category references
 */`);
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
 * _name_—declaration emit then prints e.g. `NotesDoc` instead of expanding the
 * row structure. A `type` alias (rather than an extending `interface`) is used
 * so it works for every document shape: object tables, but also union schemas
 * (`Schema.Union`) and other non-object documents, which an `interface …
 * extends` cannot represent (TS2312). The registry is threaded into the
 * generated `DatabaseReader`/`DatabaseWriter` tags so query/mutation helpers
 * print named documents with no user annotations.
 */
export const docs = ({
  schemaImportPath,
  tables,
}: Parameters<typeof docsEffect>[0]) =>
  docsEffect({ schemaImportPath, tables });

const docsEffect = Effect.fnUntraced(function* ({
  schemaImportPath,
  tables,
}: {
  schemaImportPath: string;
  tables: ReadonlyArray<{ tableName: string; docName: string }>;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  // With no tables there is nothing to import—emitting the (unused) imports
  // would trip `noUnusedLocals`.
  if (tables.length === 0) {
    yield* cbw.writeLine(
      `/**
 * Map from application table names to decoded document types. It has no entries
 * because the application declares no tables.
 *
 * @category models
 */`,
    );
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
      `/**
 * Decoded document from \`${tableName}\`, including the system fields \`_id\` and
 * \`_creationTime\`.
 *
 * @category models
 */`,
    );
    yield* cbw.writeLine(
      `export type ${docName} = Document.Document<typeof schemaDefinition, "${tableName}">;`,
    );
  }
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/**
 * Map from application table names to the decoded document types returned by the
 * database services. System tables are not included.
 *
 * @category models
 */`,
  );
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
  spec,
  tableNamesImportPath,
  specImportPath,
  implImportPath,
}: Parameters<typeof registeredFunctionsForGroupEffect>[0]) =>
  registeredFunctionsForGroupEffect({
    spec,
    tableNamesImportPath,
    specImportPath,
    implImportPath,
  });

const registeredFunctionsForGroupEffect = Effect.fnUntraced(function* ({
  spec,
  tableNamesImportPath,
  specImportPath,
  implImportPath,
}: {
  spec: GroupSpec.AnyWithProps;
  tableNamesImportPath: string;
  specImportPath: string;
  implImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });
  const useNode = spec.runtime === "Node";

  const hasConfectFunctions = (
    group: GroupSpec.AnyWithProps,
    databaseOnly: boolean,
  ): boolean =>
    Array.some(
      Record.values(group.functions),
      (fn) =>
        fn.functionProvenance._tag === "Confect" &&
        (!databaseOnly || fn.runtimeAndFunctionType.functionType !== "action"),
    ) ||
    Array.some(Record.values(group.groups), (child) =>
      hasConfectFunctions(child, databaseOnly),
    );
  const usesTableNames = !useNode && hasConfectFunctions(spec, true);
  const forwarding =
    usesTableNames || (!useNode && hasConfectFunctions(spec, false));

  if (useNode) {
    yield* cbw.writeLine(
      `import { RegisteredNodeFunction } from "@confect/server/node";`,
    );
  } else if (!forwarding) {
    yield* cbw.writeLine(
      `import { RegisteredFunctions } from "@confect/server";`,
    );
  } else {
    yield* cbw.writeLine(
      `import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";`,
    );
  }

  if (usesTableNames) {
    yield* cbw.writeLine(`import tableNames from "${tableNamesImportPath}";`);
  }
  yield* cbw.writeLine(`import groupLayer from "${implImportPath}";`);
  yield* cbw.blankLine();
  // The group's own leaf spec is referenced type-only (`typeof import(...)`),
  // so the spec module is erased at transpile time and never enters the
  // per-function bundle. Typing from the leaf spec (not the project-wide assembled spec)
  // keeps the registry's type dependent solely on its own group.
  const specType = `typeof import("${specImportPath}")["default"]`;
  if (useNode) {
    yield* cbw.writeLine(
      `export default RegisteredNodeFunction.buildForGroup<${specType}>(groupLayer);`,
    );
  } else if (!forwarding) {
    yield* cbw.writeLine(
      `export default RegisteredFunctions.buildForGroup<${specType}>([], groupLayer);`,
    );
  } else {
    const JsonString = Schema.fromJsonString(Schema.String);
    const bindings = (
      group: GroupSpec.AnyWithProps,
      path: string,
    ): Effect.Effect<string> =>
      Effect.gen(function* () {
        const functions = yield* Effect.forEach(
          Record.toEntries(group.functions),
          Effect.fnUntraced(function* ([name, functionSpec]: readonly [
            string,
            FunctionSpec.AnyWithProps,
          ]) {
            const key = yield* Schema.encodeEffect(JsonString)(name).pipe(
              Effect.orDie,
            );
            const definition = `${path}[${key}]`;
            return `[${key}]: ${
              functionSpec.functionProvenance._tag === "Convex"
                ? `${definition}.handler`
                : `RegisteredConvexFunction.register({ ...${definition}, handler: forward(${definition}.handler) })`
            },`;
          }),
          { concurrency: 1 },
        );
        const groups = yield* Effect.forEach(
          Record.toEntries(group.groups),
          Effect.fnUntraced(function* ([name, child]: readonly [
            string,
            GroupSpec.AnyWithProps,
          ]) {
            const key = yield* Schema.encodeEffect(JsonString)(name).pipe(
              Effect.orDie,
            );
            const childBindings = yield* bindings(child, `${path}[${key}]`);
            return `[${key}]: ${childBindings},`;
          }),
          { concurrency: 1 },
        );
        return `{\n${Array.join([...functions, ...groups], "\n")}\n}`;
      });
    const registered = yield* bindings(spec, "definitions");
    yield* cbw.writeLine(`const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<${specType}>(${usesTableNames ? "tableNames" : "[]"}, groupLayer);

export default ${registered} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<${specType}>;`);
  }

  return yield* cbw.toString();
});

export const services = ({
  schemaImportPath,
}: Parameters<typeof servicesEffect>[0]) =>
  servicesEffect({ schemaImportPath });

const servicesEffect = Effect.fnUntraced(function* ({
  schemaImportPath,
}: {
  schemaImportPath: string;
}) {
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
      yield* cbw.writeLine("DocumentIds as DocumentIds_,");
      yield* cbw.writeLine("ExecutionMetadata as ExecutionMetadata_,");
      yield* cbw.writeLine("MutationAuth as MutationAuth_,");
      yield* cbw.writeLine("MutationCtx as MutationCtx_,");
      yield* cbw.writeLine("MutationRunner as MutationRunner_,");
      yield* cbw.writeLine(
        "MutationTransactionContext as MutationTransactionContext_,",
      );
      yield* cbw.writeLine("QueryCtx as QueryCtx_,");
      yield* cbw.writeLine("QueryRunner as QueryRunner_,");
      yield* cbw.writeLine(
        "QueryTransactionContext as QueryTransactionContext_,",
      );
      yield* cbw.writeLine("RequestMetadata as RequestMetadata_,");
      yield* cbw.writeLine("Scheduler as Scheduler_,");
      yield* cbw.writeLine("Storage as Storage_,");
      yield* cbw.writeLine("StorageActionWriter as StorageActionWriter_,");
      yield* cbw.writeLine("StorageReader as StorageReader_,");
      yield* cbw.writeLine("StorageWriter as StorageWriter_,");
      yield* cbw.writeLine("TransactionMetadata as TransactionMetadata_,");
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
  yield* cbw.writeLine(`/**
 * Service tag for reading the caller's identity in queries, mutations, actions,
 * and HTTP handlers. The service's \`getUserIdentity\` Effect fails with
 * \`NoUserIdentityFoundError\` when the caller is unauthenticated.
 *
 * @category tags
 */`);
  yield* cbw.writeLine("export const Auth = Auth_.Auth;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link Auth}.
 *
 * @category context
 */`);
  yield* cbw.writeLine("export type Auth = typeof Auth.Identifier;");
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Service tag for signing deployment JWTs in mutations. Pass \`SignJwtOptions\` to
 * the service's \`signJwt\` method; signing failures are defects.
 *
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const MutationAuth = MutationAuth_.MutationAuth;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link MutationAuth}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type MutationAuth = typeof MutationAuth.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Service tag for reading function and deployment metadata in queries, mutations,
 * actions, and HTTP handlers.
 *
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const ExecutionMetadata = ExecutionMetadata_.ExecutionMetadata;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link ExecutionMetadata}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type ExecutionMetadata = typeof ExecutionMetadata.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Service tag for reading metadata about the current request in mutations,
 * actions, and HTTP handlers. Queries do not provide request metadata.
 *
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const RequestMetadata = RequestMetadata_.RequestMetadata;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link RequestMetadata}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type RequestMetadata = typeof RequestMetadata.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Service tag for reading transaction metrics and the snapshot timestamp in
 * queries and mutations.
 *
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const TransactionMetadata = TransactionMetadata_.TransactionMetadata;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link TransactionMetadata}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type TransactionMetadata = typeof TransactionMetadata.Identifier;",
  );
  yield* cbw.blankLine();

  // Scheduler
  yield* cbw.writeLine(`/**
 * Service tag for scheduling mutations and actions from mutations, actions, and
 * HTTP handlers. Schedule a reference after an Effect \`Duration\` or at a
 * \`DateTime\`; use the returned scheduled-function ID to cancel the job.
 *
 * **Gotchas**
 *
 * Argument encoding can throw before the scheduling method returns an Effect.
 *
 * @category tags
 */`);
  yield* cbw.writeLine("export const Scheduler = Scheduler_.Scheduler;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link Scheduler}.
 *
 * @category context
 */`);
  yield* cbw.writeLine("export type Scheduler = typeof Scheduler.Identifier;");
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Service tag for working with files in Convex storage. Queries, mutations,
 * actions, and HTTP handlers can resolve a storage ID to a URL; a missing file
 * fails with \`BlobNotFoundError\`.
 *
 * **Details**
 *
 * Upload URL generation and deletion require {@link StorageWriter}. Reading and
 * storing blobs require {@link StorageActionWriter}. Mutations, actions, and HTTP
 * handlers provide both writer services.
 *
 * @category tags
 */`);
  yield* cbw.writeLine("export const Storage = Storage_.Storage;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link Storage}.
 *
 * @category context
 */`);
  yield* cbw.writeLine("export type Storage = typeof Storage.Identifier;");
  yield* cbw.blankLine();

  // StorageReader
  yield* cbw.writeLine(`/**
 * Compatibility tag for resolving storage IDs to URLs in queries, mutations,
 * actions, and HTTP handlers. A missing file fails with \`BlobNotFoundError\`.
 *
 * @see {@link Storage} for the storage API recommended for new code.
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const StorageReader = StorageReader_.StorageReader;",
  );
  yield* cbw.writeLine(`/**
 * Compatibility environment requirement for {@link StorageReader}; use
 * {@link Storage} in new code.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type StorageReader = typeof StorageReader.Identifier;",
  );
  yield* cbw.blankLine();

  // StorageWriter
  yield* cbw.writeLine(`/**
 * Compatibility tag for generating upload URLs and deleting stored files in
 * mutations, actions, and HTTP handlers. The service reports deletion failures as
 * \`BlobNotFoundError\`.
 *
 * @see {@link Storage} for the storage API recommended for new code.
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const StorageWriter = StorageWriter_.StorageWriter;",
  );
  yield* cbw.writeLine(`/**
 * Compatibility environment requirement for {@link StorageWriter}; use
 * {@link Storage} in new code.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type StorageWriter = typeof StorageWriter.Identifier;",
  );
  yield* cbw.blankLine();

  // StorageActionWriter
  yield* cbw.writeLine(`/**
 * Compatibility tag for reading and storing blobs in mutations, actions, and HTTP
 * handlers. A missing blob fails with \`BlobNotFoundError\`; storing a blob accepts
 * an optional SHA-256 checksum and returns a storage ID.
 *
 * @see {@link Storage} for the storage API recommended for new code.
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const StorageActionWriter = StorageActionWriter_.StorageActionWriter;",
  );
  yield* cbw.writeLine(`/**
 * Compatibility environment requirement for {@link StorageActionWriter}; use
 * {@link Storage} in new code.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type StorageActionWriter = typeof StorageActionWriter.Identifier;",
  );
  yield* cbw.blankLine();

  // VectorSearch
  yield* cbw.writeLine(`/**
 * Service tag for searching a table's vector index from actions or a schema-typed
 * HTTP router. Call the service with the table name, index, and search options to
 * get ranked document IDs and scores.
 *
 * **Gotchas**
 *
 * Results do not contain decoded documents. A Convex search failure is a defect.
 *
 * @public
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const VectorSearch: VectorSearch_.VectorSearchTag<",
  );
  yield* cbw.indent(
    cbw.writeLine("DataModel.FromDatabaseSchema<typeof schemaDefinition>"),
  );
  yield* cbw.writeLine(
    "> = VectorSearch_.VectorSearch<DataModel.FromDatabaseSchema<typeof schemaDefinition>>();",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link VectorSearch}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type VectorSearch = typeof VectorSearch.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Service tag for validating document IDs in queries and mutations. Use \`parse\` to
 * check a string against one table or \`identify\` to find its table among the
 * application's tables and Convex's system tables.
 *
 * **Gotchas**
 *
 * Both methods return \`None\` for an invalid ID. A match does not prove a document
 * exists.
 *
 * @public
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const DocumentIds: DocumentIds_.DocumentIdsTag<typeof schemaDefinition> = DocumentIds_.DocumentIds<typeof schemaDefinition>();",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link DocumentIds}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type DocumentIds = typeof DocumentIds.Identifier;",
  );
  yield* cbw.blankLine();

  // DatabaseReader
  yield* cbw.writeLine(`/**
 * Service tag for reading decoded documents in queries and mutations. Pass a
 * generated application table handle or a system table handle to \`reader.table\`.
 *
 * **Gotchas**
 *
 * A decoding failure is a typed \`DocumentDecodeError\`. Looking up a missing
 * document with \`get(id)\` fails with \`GetByIdFailure\` rather than returning an
 * empty result.
 *
 * @public
 * @category tags
 */`);
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
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link DatabaseReader}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type DatabaseReader = typeof DatabaseReader.Identifier;",
  );
  yield* cbw.blankLine();

  // DatabaseWriter
  yield* cbw.writeLine(`/**
 * Service tag for writing documents in mutations. Pass a generated application
 * table handle to \`writer.table\` to insert, patch, replace, or delete documents.
 * Inserts, patches, and replacements encode values through the table schema.
 *
 * @see {@link DatabaseReader} for reading application and system tables.
 * @public
 * @category tags
 */`);
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
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link DatabaseWriter}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type DatabaseWriter = typeof DatabaseWriter.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Transaction controls tag, provided in queries and mutations.
 * Prefer QueryRunner.runQuery with transactionLimits; it requests this service when options are supplied.
 * @internal
 */`);
  yield* cbw.writeLine(
    "export const QueryTransactionContext = QueryTransactionContext_.QueryTransactionContext;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link QueryTransactionContext}.
 * @internal
 */`);
  yield* cbw.writeLine(
    "export type QueryTransactionContext = typeof QueryTransactionContext.Identifier;",
  );
  yield* cbw.blankLine();
  yield* cbw.writeLine(`/**
 * Mutation transaction controls tag, provided only in mutations.
 * QueryRunner requests this service for useStaleSnapshot; MutationRunner requests it for transactionLimits.
 * @internal
 */`);
  yield* cbw.writeLine(
    "export const MutationTransactionContext = MutationTransactionContext_.MutationTransactionContext;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link MutationTransactionContext}.
 * @internal
 */`);
  yield* cbw.writeLine(
    "export type MutationTransactionContext = typeof MutationTransactionContext.Identifier;",
  );
  yield* cbw.blankLine();

  // QueryRunner
  yield* cbw.writeLine(`/**
 * Service tag for calling queries from queries, mutations, actions, and HTTP
 * handlers. Pass a query reference and decoded arguments to \`runQuery\` to get the
 * decoded result. Declared errors and \`SchemaError\` are typed failures.
 *
 * **Gotchas**
 *
 * Transaction limits require a query or mutation context. Supplying
 * \`useStaleSnapshot\`, even when false, requires a mutation.
 *
 * @category tags
 */`);
  yield* cbw.writeLine("export const QueryRunner = QueryRunner_.QueryRunner;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link QueryRunner}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type QueryRunner = typeof QueryRunner.Identifier;",
  );
  yield* cbw.blankLine();

  // MutationRunner
  yield* cbw.writeLine(`/**
 * Service tag for calling mutations from mutations, actions, and HTTP handlers.
 * Pass a mutation reference and decoded arguments to \`runMutation\` to get the
 * decoded result. Declared errors and \`SchemaError\` are typed failures.
 *
 * **Gotchas**
 *
 * Transaction limits require a mutation context. Omit the options when calling
 * from an action or HTTP handler.
 *
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const MutationRunner = MutationRunner_.MutationRunner;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link MutationRunner}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type MutationRunner = typeof MutationRunner.Identifier;",
  );
  yield* cbw.blankLine();

  // ActionRunner
  yield* cbw.writeLine(`/**
 * Service tag for calling actions from actions and HTTP handlers. Pass an action
 * reference and decoded arguments to \`runAction\` to get the decoded result.
 * Declared errors and \`SchemaError\` are typed failures.
 *
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const ActionRunner = ActionRunner_.ActionRunner;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link ActionRunner}.
 *
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type ActionRunner = typeof ActionRunner.Identifier;",
  );
  yield* cbw.blankLine();

  // QueryCtx
  yield* cbw.writeLine(`/**
 * Service tag for the native Convex query context, typed to the application's
 * schema and available only in queries. Native reads return encoded document
 * values rather than Confect's decoded values.
 *
 * @public
 * @category tags
 */`);
  yield* cbw.writeLine("export const QueryCtx: QueryCtx_.QueryCtxTag<");
  yield* cbw.indent(
    cbw.writeLine(
      "DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>",
    ),
  );
  yield* cbw.writeLine("> = QueryCtx_.QueryCtx<");
  yield* cbw.indent(
    cbw.writeLine(
      "DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>",
    ),
  );
  yield* cbw.writeLine(">();");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link QueryCtx}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine("export type QueryCtx = typeof QueryCtx.Identifier;");
  yield* cbw.blankLine();

  // MutationCtx
  yield* cbw.writeLine(`/**
 * Service tag for the native Convex mutation context, typed to the application's
 * schema and available only in mutations. Native database operations use encoded
 * document values rather than Confect's decoded values.
 *
 * @public
 * @category tags
 */`);
  yield* cbw.writeLine(
    "export const MutationCtx: MutationCtx_.MutationCtxTag<",
  );
  yield* cbw.indent(
    cbw.writeLine(
      "DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>",
    ),
  );
  yield* cbw.writeLine("> = MutationCtx_.MutationCtx<");
  yield* cbw.indent(
    cbw.writeLine(
      "DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>",
    ),
  );
  yield* cbw.writeLine(">();");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link MutationCtx}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine(
    "export type MutationCtx = typeof MutationCtx.Identifier;",
  );
  yield* cbw.blankLine();

  // ActionCtx
  yield* cbw.writeLine(`/**
 * Service tag for the native Convex action context, typed to the application's
 * schema and available in actions. Native function calls use the wire
 * representations of arguments and results.
 *
 * @public
 * @category tags
 */`);
  yield* cbw.writeLine("export const ActionCtx: ActionCtx_.ActionCtxTag<");
  yield* cbw.indent(
    cbw.writeLine(
      "DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>",
    ),
  );
  yield* cbw.writeLine("> = ActionCtx_.ActionCtx<");
  yield* cbw.indent(
    cbw.writeLine(
      "DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>",
    ),
  );
  yield* cbw.writeLine(">();");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link ActionCtx}.
 *
 * @public
 * @category context
 */`);
  yield* cbw.writeLine("export type ActionCtx = typeof ActionCtx.Identifier;");

  return yield* cbw.toString();
});

export const assembledSpec = ({
  nodes,
}: {
  nodes: ReadonlyArray<SpecAssemblyNode>;
}) => renderSpecAssembly(nodes);
