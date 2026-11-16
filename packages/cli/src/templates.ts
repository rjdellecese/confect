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
 * Convex schema for deployment and convex-test setup.
 * Do not import this module from function runtime code; it constructs validators for every table.
 */`);
  yield* cbw.writeLine(`export { default } from "${convexSchemaImportPath}";`);

  return yield* cbw.toString();
});

interface TableModuleBinding {
  readonly importPath: string;
  readonly tableName: string;
}

/**
 * Emit `confect/_generated/schema.ts`—the runtime `DatabaseSchema` used by
 * impls and the per-group registries (and downstream by per-function bundles
 * for codec lookup). Every table wrapper at
 * `confect/_generated/tables/<name>.ts` is imported statically and registered
 * as a value entry on the `DatabaseSchema.make({...})` call. Per-table laziness
 * lives inside each `Table`: its `Fields` and `Doc` are lazy memoised getters
 * that only evaluate the user-supplied field-schema callback on first access,
 * so unused tables in a function bundle never pay schema-construction cost
 * despite the static import.
 *
 * The `DatabaseSchema` import is aliased to `$DatabaseSchema` because each
 * table is imported under its own (filename-derived) name; a table named
 * `DatabaseSchema` would otherwise collide with the library import and emit a
 * duplicate-binding file. The leading `$` makes the alias collision-proof:
 * `validateConfectTableIdentifier` requires names to match
 * `/^[a-zA-Z][a-zA-Z0-9_]*$/`, which forbids `$`, so no valid table import can
 * ever shadow it.
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
    `import { DatabaseSchema as $DatabaseSchema } from "@confect/server";`,
  );

  if (tableModules.length > 0) {
    yield* cbw.blankLine();
    yield* Effect.forEach(tableModules, ({ tableName, importPath }) =>
      cbw.writeLine(`import ${tableName} from "${importPath}";`),
    );
  }

  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Runtime table and codec registry for Confect handlers and test setup.
 * Table schemas stay lazy until accessed. Use convexSchema instead for Convex deployment validators.
 */`);
  if (tableModules.length === 0) {
    yield* cbw.writeLine(
      `const databaseSchema: $DatabaseSchema.DatabaseSchema = $DatabaseSchema.make({});`,
    );
  } else {
    yield* cbw.writeLine(
      `const databaseSchema: $DatabaseSchema.DatabaseSchema<{`,
    );
    yield* cbw.indent(
      Effect.forEach(
        tableModules,
        ({ tableName }) =>
          cbw.writeLine(`readonly ${tableName}: typeof ${tableName};`),
        { discard: true },
      ),
    );
    yield* cbw.writeLine(`}> = $DatabaseSchema.make({`);
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
 * Emit `confect/_generated/convexSchema.ts`—the Convex deploy-time
 * `SchemaDefinition`. Imports every table from its generated wrapper at
 * `_generated/tables/<name>` and calls `defineSchema({...})` exactly once.
 * `Table.tableDefinition` lives in `@confect/server` because it is the
 * `defineTable` binding; the generated table wrappers themselves stay
 * client-safe (`Fields`/`Doc` from `@confect/core`).
 *
 * The `defineSchema` and `Table` imports are aliased with a leading `$` because
 * each table is imported under its own (filename-derived) name; a table named
 * `defineSchema` or `Table` would otherwise collide with the library import and
 * emit a duplicate-binding file. `validateConfectTableIdentifier` requires
 * names to match `/^[a-zA-Z][a-zA-Z0-9_]*$/`, which forbids `$`, so no valid
 * table import can ever shadow them.
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
    `import { defineSchema as $defineSchema } from "convex/server";`,
  );

  if (tableModules.length > 0) {
    yield* cbw.writeLine(`import { Table as $Table } from "@confect/server";`);
    yield* cbw.blankLine();
    yield* Effect.forEach(tableModules, ({ tableName, importPath }) =>
      cbw.writeLine(`import ${tableName} from "${importPath}";`),
    );
  }

  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Convex validators and indexes for deployment and convex-test setup.
 * Importing this module constructs every table's deployment definition.
 * Use the runtime schema module in function implementations instead.
 */`);
  if (tableModules.length === 0) {
    yield* cbw.writeLine(`export default $defineSchema({});`);
  } else {
    yield* cbw.writeLine(`export default $defineSchema({`);
    yield* cbw.indent(
      Effect.gen(function* () {
        for (const { tableName } of tableModules) {
          yield* cbw.writeLine(
            `${tableName}: $Table.tableDefinition(${tableName}),`,
          );
        }
      }),
    );
    yield* cbw.writeLine(`});`);
  }

  return yield* cbw.toString();
});

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
export const id = ({ tableNames }: Parameters<typeof idEffect>[0]) =>
  idEffect({ tableNames });

const idEffect = Effect.fnUntraced(function* ({
  tableNames,
}: {
  tableNames: ReadonlyArray<string>;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(`import { GenericId } from "@confect/core";`);
  yield* cbw.writeLine(
    `import type { SystemTableNames } from "convex/server";`,
  );
  yield* cbw.blankLine();

  const union =
    tableNames.length === 0
      ? "never"
      : Array.join(
          Array.map(tableNames, (n) => `"${n}"`),
          " | ",
        );
  yield* cbw.writeLine(
    `/** Application table names; excludes system tables and is never when no tables exist. */`,
  );
  yield* cbw.writeLine(`export type TableNames = ${union};`);
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/** A Convex document ID branded with its application or system table name. */`,
  );
  yield* cbw.writeLine(
    `export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName>;`,
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/**
 * Creates an Effect schema for a document ID without importing the referenced table.
 * Decoding accepts strings; it does not verify the ID's format, table membership, or existence.
 * Use DocumentIds in queries or mutations to validate table membership.
 *
 * @param tableName - An application or Convex system table name.
 * @returns A schema whose decoded and encoded types are Id<TableName>.
 */`,
  );
  yield* cbw.writeLine(
    `export const Id = <const TableName extends TableNames | SystemTableNames>(`,
  );
  yield* cbw.indent(cbw.writeLine(`tableName: TableName,`));
  yield* cbw.writeLine(`) => GenericId.GenericId(tableName);`);

  return yield* cbw.toString();
});

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

  yield* cbw.writeLine(`import unnamed from "${unnamedImportPath}";`);
  yield* cbw.blankLine();
  yield* cbw.writeLine(`/**
 * Named table definition for ${tableName}, including its indexes and lazy Fields and Doc schemas.
 * Doc includes _id and _creationTime; Fields describes the user-defined fields.
 * Importing this wrapper binds the table name without evaluating its field-schema callback.
 */`);
  yield* cbw.writeLine(`export default unnamed("${tableName}");`);

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
    `/** HTTP router exposed to Convex from the application's HTTP routes. */`,
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
    `/** Recurring jobs exposed to Convex from the application's cron definitions. */`,
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
    `/** Authentication provider configuration consumed by Convex at deployment. */`,
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
    `/** Installed component names mapped to their typed ComponentApi function references. */`,
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
        { discard: true },
      ),
    );
    yield* cbw.writeLine(`};`);
  }
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/**
 * Function references for components installed with app.use in convex/convex.config.ts.
 * Entries use their installed names. Pass their references to Convex component APIs or native contexts.
 * This registry is available before Convex codegen and does not invoke component functions.
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
 * Typed function references nested by group path and function name.
 * public exposes client-callable functions; internal exposes server-only functions.
 * These are type-filtered views, not a runtime authorization boundary.
 * Each leaf is a Ref carrying argument, return, and declared error types, not a callable function.
 * Pass leaves to Confect clients, runners, or the scheduler; Confect codecs are evaluated lazily.
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
      `/** Map of application table names to decoded document types; empty when no tables exist. */`,
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
      `/** Decoded ${tableName} document, including _id and _creationTime. */`,
    );
    yield* cbw.writeLine(
      `export type ${docName} = Document.Document<typeof schemaDefinition, "${tableName}">;`,
    );
  }
  yield* cbw.blankLine();

  yield* cbw.writeLine(
    `/** Application table names mapped to decoded document types used by database services; excludes system tables. */`,
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
  schemaImportPath,
  specImportPath,
  implImportPath,
}: Parameters<typeof registeredFunctionsForGroupEffect>[0]) =>
  registeredFunctionsForGroupEffect({
    spec,
    schemaImportPath,
    specImportPath,
    implImportPath,
  });

const registeredFunctionsForGroupEffect = Effect.fnUntraced(function* ({
  spec,
  schemaImportPath,
  specImportPath,
  implImportPath,
}: {
  spec: GroupSpec.AnyWithProps;
  schemaImportPath: string;
  specImportPath: string;
  implImportPath: string;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });
  const useNode = spec.runtime === "Node";

  const hasConfectFunctions = (group: GroupSpec.AnyWithProps): boolean =>
    Array.some(
      Record.values(group.functions),
      (functionSpec) => functionSpec.functionProvenance._tag === "Confect",
    ) || Array.some(Record.values(group.groups), hasConfectFunctions);
  const forwarding = !useNode && hasConfectFunctions(spec);

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

  yield* cbw.writeLine(`import databaseSchema from "${schemaImportPath}";`);
  yield* cbw.writeLine(`import groupLayer from "${implImportPath}";`);
  yield* cbw.blankLine();
  // The group's own leaf spec is referenced type-only (`typeof import(...)`),
  // so the spec module is erased at transpile time and never enters the
  // per-function bundle; only `databaseSchema` and the impl are runtime
  // imports. Typing from the leaf spec (not the project-wide assembled spec)
  // keeps the registry's type dependent solely on its own group.
  const specType = `typeof import("${specImportPath}")["default"]`;
  if (useNode) {
    yield* cbw.writeLine(
      `export default RegisteredNodeFunction.buildForGroup<${specType}>(databaseSchema, groupLayer);`,
    );
  } else if (!forwarding) {
    yield* cbw.writeLine(
      `export default RegisteredFunctions.buildForGroup<${specType}>(databaseSchema, groupLayer);`,
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
        );
        return `{\n${Array.join([...functions, ...groups], "\n")}\n}`;
      });
    const registered = yield* bindings(spec, "definitions");
    yield* cbw.writeLine(`const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<${specType}>(databaseSchema, groupLayer);

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
 * Authentication service tag, provided in queries, mutations, actions, and HTTP handlers.
 * Yield this tag to read the caller's identity; getUserIdentity fails with NoUserIdentityFoundError when unauthenticated.
 */`);
  yield* cbw.writeLine("export const Auth = Auth_.Auth;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link Auth}.
 */`);
  yield* cbw.writeLine("export type Auth = typeof Auth.Identifier;");
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * JWT-signing service tag, provided only in mutations.
 * Yield this tag and pass SignJwtOptions to signJwt; signing failures are defects.
 */`);
  yield* cbw.writeLine(
    "export const MutationAuth = MutationAuth_.MutationAuth;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link MutationAuth}.
 */`);
  yield* cbw.writeLine(
    "export type MutationAuth = typeof MutationAuth.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Execution metadata service tag, provided in queries, mutations, actions, and HTTP handlers.
 * Yield this tag to read function and deployment metadata.
 */`);
  yield* cbw.writeLine(
    "export const ExecutionMetadata = ExecutionMetadata_.ExecutionMetadata;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link ExecutionMetadata}.
 */`);
  yield* cbw.writeLine(
    "export type ExecutionMetadata = typeof ExecutionMetadata.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Request metadata service tag, provided in mutations, actions, and HTTP handlers, not queries.
 * Yield this tag to read metadata for the current request.
 */`);
  yield* cbw.writeLine(
    "export const RequestMetadata = RequestMetadata_.RequestMetadata;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link RequestMetadata}.
 */`);
  yield* cbw.writeLine(
    "export type RequestMetadata = typeof RequestMetadata.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Transaction metadata service tag, provided in queries and mutations.
 * Yield this tag to read transaction metrics and the snapshot timestamp.
 */`);
  yield* cbw.writeLine(
    "export const TransactionMetadata = TransactionMetadata_.TransactionMetadata;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link TransactionMetadata}.
 */`);
  yield* cbw.writeLine(
    "export type TransactionMetadata = typeof TransactionMetadata.Identifier;",
  );
  yield* cbw.blankLine();

  // Scheduler
  yield* cbw.writeLine(`/**
 * Scheduling service tag, provided in mutations, actions, and HTTP handlers.
 * Yield this tag to schedule mutation or action refs with an Effect Duration or DateTime, or cancel a scheduled ID.
 * Scheduling returns the scheduled-function ID; argument encoding can throw synchronously.
 */`);
  yield* cbw.writeLine("export const Scheduler = Scheduler_.Scheduler;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link Scheduler}.
 */`);
  yield* cbw.writeLine("export type Scheduler = typeof Scheduler.Identifier;");
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Storage facade tag, provided in queries, mutations, actions, and HTTP handlers.
 * getUrl returns a URL or fails with BlobNotFoundError. Upload URLs and deletion require StorageWriter;
 * blob reads and writes require StorageActionWriter. Both writer services are provided in mutations, actions, and HTTP handlers.
 */`);
  yield* cbw.writeLine("export const Storage = Storage_.Storage;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link Storage}.
 */`);
  yield* cbw.writeLine("export type Storage = typeof Storage.Identifier;");
  yield* cbw.blankLine();

  // StorageReader
  yield* cbw.writeLine(`/**
 * Compatibility storage URL service tag, provided in queries, mutations, actions, and HTTP handlers.
 * Use Storage in new code. getUrl resolves a storage ID to a URL or fails with BlobNotFoundError.
 */`);
  yield* cbw.writeLine(
    "export const StorageReader = StorageReader_.StorageReader;",
  );
  yield* cbw.writeLine(`/**
 * Compatibility environment requirement for {@link StorageReader}; use Storage in new code.
 */`);
  yield* cbw.writeLine(
    "export type StorageReader = typeof StorageReader.Identifier;",
  );
  yield* cbw.blankLine();

  // StorageWriter
  yield* cbw.writeLine(`/**
 * Compatibility storage write service tag, provided in mutations, actions, and HTTP handlers.
 * Use Storage in new code. This service generates upload URLs and deletes files; deletion failures become BlobNotFoundError.
 */`);
  yield* cbw.writeLine(
    "export const StorageWriter = StorageWriter_.StorageWriter;",
  );
  yield* cbw.writeLine(`/**
 * Compatibility environment requirement for {@link StorageWriter}; use Storage in new code.
 */`);
  yield* cbw.writeLine(
    "export type StorageWriter = typeof StorageWriter.Identifier;",
  );
  yield* cbw.blankLine();

  // StorageActionWriter
  yield* cbw.writeLine(`/**
 * Compatibility blob storage service tag, provided in mutations, actions, and HTTP handlers despite its name.
 * Use Storage in new code.
 * get returns a Blob or fails with BlobNotFoundError; store accepts a Blob and optional sha256 and returns a storage ID.
 */`);
  yield* cbw.writeLine(
    "export const StorageActionWriter = StorageActionWriter_.StorageActionWriter;",
  );
  yield* cbw.writeLine(`/**
 * Compatibility environment requirement for {@link StorageActionWriter}; use Storage in new code.
 */`);
  yield* cbw.writeLine(
    "export type StorageActionWriter = typeof StorageActionWriter.Identifier;",
  );
  yield* cbw.blankLine();

  // VectorSearch
  yield* cbw.writeLine(`/**
 * Schema-typed vector search service tag, provided in actions and HTTP handlers.
 * Yield this tag and call it with a table, vector index, and search options to return document IDs and scores.
 * Convex search failures are defects; results do not contain decoded documents.
 * @public
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
 * @public
 */`);
  yield* cbw.writeLine(
    "export type VectorSearch = typeof VectorSearch.Identifier;",
  );
  yield* cbw.blankLine();

  yield* cbw.writeLine(`/**
 * Schema-typed ID validation service tag, provided in queries and mutations.
 * parse checks a string against a table; identify checks application and system tables.
 * Both return Option.none for invalid IDs and do not check whether the document exists.
 * @public
 */`);
  yield* cbw.writeLine(
    "export const DocumentIds: DocumentIds_.DocumentIdsTag<typeof schemaDefinition> = DocumentIds_.DocumentIds<typeof schemaDefinition>();",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link DocumentIds}.
 * @public
 */`);
  yield* cbw.writeLine(
    "export type DocumentIds = typeof DocumentIds.Identifier;",
  );
  yield* cbw.blankLine();

  // DatabaseReader
  yield* cbw.writeLine(`/**
 * Schema-typed database reader tag, provided in queries and mutations.
 * Yield this tag to read decoded documents using the generated Docs aliases.
 * Document decoding failures use DocumentDecodeError; table(name).get(id) fails with GetByIdFailure when absent.
 * @public
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
 * @public
 */`);
  yield* cbw.writeLine(
    "export type DatabaseReader = typeof DatabaseReader.Identifier;",
  );
  yield* cbw.blankLine();

  // DatabaseWriter
  yield* cbw.writeLine(`/**
 * Schema-typed database writer tag, provided only in mutations.
 * Yield this tag and select table(name) to insert, patch, replace, or delete documents using decoded field values.
 * Inserts, patches, and replacements encode values through the table schema; see each operation's error behavior.
 * @public
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
 * @public
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
 * Query invocation service tag, provided in queries, mutations, actions, and HTTP handlers.
 * runQuery accepts a query ref and decoded arguments and returns its decoded result as an Effect.
 * Declared errors and SchemaError are typed failures. transactionLimits require a query or mutation;
 * useStaleSnapshot requires a mutation.
 */`);
  yield* cbw.writeLine("export const QueryRunner = QueryRunner_.QueryRunner;");
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link QueryRunner}.
 */`);
  yield* cbw.writeLine(
    "export type QueryRunner = typeof QueryRunner.Identifier;",
  );
  yield* cbw.blankLine();

  // MutationRunner
  yield* cbw.writeLine(`/**
 * Mutation invocation service tag, provided in mutations, actions, and HTTP handlers.
 * runMutation accepts a mutation ref and decoded arguments and returns its decoded result as an Effect.
 * Declared errors and SchemaError are typed failures. transactionLimits require a mutation context.
 */`);
  yield* cbw.writeLine(
    "export const MutationRunner = MutationRunner_.MutationRunner;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link MutationRunner}.
 */`);
  yield* cbw.writeLine(
    "export type MutationRunner = typeof MutationRunner.Identifier;",
  );
  yield* cbw.blankLine();

  // ActionRunner
  yield* cbw.writeLine(`/**
 * Action invocation service tag, provided in actions and HTTP handlers.
 * runAction accepts an action ref and decoded arguments and returns its decoded result as an Effect.
 * Declared errors and SchemaError are typed failures.
 */`);
  yield* cbw.writeLine(
    "export const ActionRunner = ActionRunner_.ActionRunner;",
  );
  yield* cbw.writeLine(`/**
 * Effect environment requirement for {@link ActionRunner}.
 */`);
  yield* cbw.writeLine(
    "export type ActionRunner = typeof ActionRunner.Identifier;",
  );
  yield* cbw.blankLine();

  // QueryCtx
  yield* cbw.writeLine(`/**
 * Schema-typed native Convex query context tag, provided only in queries.
 * Yield this tag to access raw Convex APIs; document values use encoded rather than Confect-decoded types.
 * @public
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
 * @public
 */`);
  yield* cbw.writeLine("export type QueryCtx = typeof QueryCtx.Identifier;");
  yield* cbw.blankLine();

  // MutationCtx
  yield* cbw.writeLine(`/**
 * Schema-typed native Convex mutation context tag, provided only in mutations.
 * Yield this tag to access raw Convex APIs; document values use encoded rather than Confect-decoded types.
 * @public
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
 * @public
 */`);
  yield* cbw.writeLine(
    "export type MutationCtx = typeof MutationCtx.Identifier;",
  );
  yield* cbw.blankLine();

  // ActionCtx
  yield* cbw.writeLine(`/**
 * Schema-typed native Convex action context tag, provided in actions.
 * Yield this tag to access raw Convex APIs; function arguments and results use their wire representations.
 * @public
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
 * @public
 */`);
  yield* cbw.writeLine("export type ActionCtx = typeof ActionCtx.Identifier;");

  return yield* cbw.toString();
});

export const assembledSpec = ({
  nodes,
}: {
  nodes: ReadonlyArray<SpecAssemblyNode>;
}) => renderSpecAssembly(nodes);
