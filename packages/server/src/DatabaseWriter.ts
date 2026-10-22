import type {
  BetterOmit,
  DocumentByName,
  Expand,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import { pipe } from "effect/Function";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type { DocumentByName as DocumentByName_ } from "./DataModel";
import * as Document from "./Document";
import * as QueryInitializer from "./QueryInitializer";
import type * as Table from "./Table";

/**
 * The argument accepted by `patch`: like `Partial<Doc>` without system fields,
 * but the fields that are already optional also accept `undefined`, since
 * setting a field to `undefined` unsets it.
 */
export type PatchValue<Doc> = {
  [
    K in keyof Doc as K extends "_id" | "_creationTime" ? never : K
  ]?: undefined extends Doc[K] ? Doc[K] | undefined : Doc[K];
};

export interface DatabaseWriterTableAccessor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DocumentByName_<DataModel_, TableName>,
> {
  readonly insert: (
    document: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<GenericId<TableName>, Document.DocumentEncodeError>;
  readonly patch: (
    id: GenericId<TableName>,
    patchedValues: PatchValue<Doc>,
  ) => Effect.Effect<
    void,
    | QueryInitializer.GetByIdFailure
    | Document.DocumentDecodeError
    | Document.DocumentEncodeError
  >;
  readonly replace: (
    id: GenericId<TableName>,
    value: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<void, Document.DocumentEncodeError>;
  readonly delete: (id: GenericId<TableName>) => Effect.Effect<void>;
}

/**
 * The service shape backing the `DatabaseWriter` tag. Named (rather than an
 * inferred anonymous object) so declaration emit prints
 * `DatabaseWriterService<…>` by reference instead of expanding the data model.
 * `Docs` is the optional named document registry (see
 * `DatabaseReaderService`).
 */
export interface DatabaseWriterService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  readonly table: <
    const TableName extends DataModel.TableNames<
      DataModel.FromSchema<DatabaseSchema_>
    >,
  >(
    tableName: TableName,
  ) => DatabaseWriterTableAccessor<
    DataModel.FromSchema<DatabaseSchema_>,
    TableName,
    TableName extends keyof Docs
      ? Docs[TableName]
      : DocumentByName_<DataModel.FromSchema<DatabaseSchema_>, TableName>
  >;
}

// -----------------------------------------------------------------------------
// Field-level patches
// -----------------------------------------------------------------------------
//
// Convex's `patch` reads the document once; `get` followed by `replace` reads
// it twice. So `patch` encodes only the patched fields and calls Convex's
// `patch` where that stores what decoding, merging, and replacing would: the
// table schema is a struct of string-named properties with no index signatures
// and no struct-level checks, and no schema inside it transforms or is a
// declaration. The struct then encodes each field on its own, and in a
// document that decodes, re-encoding a field the patch leaves alone stores it
// as it was, except for object keys the decode drops (the keys of a narrower
// union member, record keys that fail their key schema): `replace` deleted
// them, and Convex's `patch` keeps them. Checks inside a field run on the
// patched value; the fields a patch leaves alone are not re-checked. A table of
// any other shape, a key the table does not declare, `undefined` for a required
// field, a value that does not encode, or a patch Convex rejects takes the
// decode, merge, and `replace` path, which reports the same failures it always
// has.

interface PatchField {
  readonly isOptional: boolean;
  readonly encode: (value: unknown) => Option.Option<unknown>;
}

type PatchFields = ReadonlyMap<string, PatchField>;

/**
 * How many nested `suspend`s the walk follows before it gives up.
 */
const maxSuspendDepth = 64;

/**
 * Whether encoding with `ast` returns every value it accepts unchanged, apart
 * from object keys the parse drops. A node kind not listed here is not.
 */
const encodesUnchanged = (
  ast: SchemaAST.AST,
  seen: Set<SchemaAST.AST> = new Set(),
  suspendDepth = 0,
): boolean => {
  if (seen.has(ast)) return true;
  seen.add(ast);
  if (ast.encoding !== undefined) return false;
  const unchanged = (child: SchemaAST.AST) =>
    encodesUnchanged(child, seen, suspendDepth);
  switch (ast._tag) {
    case "Null":
    case "Undefined":
    case "Void":
    case "Never":
    case "Any":
    case "Unknown":
    case "ObjectKeyword":
    case "Enum":
    case "UniqueSymbol":
    case "Literal":
    case "String":
    case "Number":
    case "Boolean":
    case "Symbol":
    case "BigInt":
    // A template literal's parser returns its input whenever it succeeds.
    case "TemplateLiteral":
      return true;
    case "Objects":
      return (
        ast.propertySignatures.every(({ type }) => unchanged(type)) &&
        ast.indexSignatures.every(
          ({ parameter, type }) => unchanged(parameter) && unchanged(type),
        )
      );
    case "Arrays":
      return ast.elements.every(unchanged) && ast.rest.every(unchanged);
    case "Union":
      return ast.types.every(unchanged);
    case "Suspend":
      // A thunk that builds its schema anew on every call never returns a node
      // already seen.
      return (
        suspendDepth < maxSuspendDepth &&
        encodesUnchanged(ast.thunk(), seen, suspendDepth + 1)
      );
    default:
      return false;
  }
};

const makePatchFields = (ast: SchemaAST.AST): Option.Option<PatchFields> => {
  if (
    !SchemaAST.isObjects(ast) ||
    ast.indexSignatures.length > 0 ||
    ast.checks !== undefined ||
    ast.encodingChecks !== undefined ||
    !encodesUnchanged(ast)
  ) {
    return Option.none();
  }
  const fields = new Map<string, PatchField>();
  for (const { name, type } of ast.propertySignatures) {
    if (!Predicate.isString(name)) return Option.none();
    let encode: PatchField["encode"] | undefined;
    fields.set(name, {
      isOptional: SchemaAST.isOptional(type),
      // Every parser on this path is synchronous: nothing in it has an
      // encoding or is a declaration.
      encode: (value) =>
        (encode ??= Schema.encodeUnknownOption(
          Schema.make<Schema.Codec<unknown>>(type),
        ))(value),
    });
  }
  return Option.some(fields);
};

const patchFieldsCache = new WeakMap<
  Table.AnyWithProps,
  Option.Option<PatchFields>
>();

/**
 * The table's fields by name when a field-level patch stores what a
 * whole-document `replace` would. Decided once per table.
 */
const patchFields = (table: Table.AnyWithProps): Option.Option<PatchFields> => {
  let fields = patchFieldsCache.get(table);
  if (fields === undefined) {
    fields = makePatchFields(table.Fields.ast);
    patchFieldsCache.set(table, fields);
  }
  return fields;
};

/**
 * The patch encoded for Convex's `patch`, or `None` where only the decode,
 * merge, and `replace` path can say what the patch does.
 */
const encodePatch = (
  fields: PatchFields,
  patchedValues: Readonly<Record<string, unknown>>,
): Option.Option<Record<string, unknown>> => {
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patchedValues)) {
    const field = fields.get(key);
    if (field === undefined) return Option.none();
    if (value === undefined) {
      if (!field.isOptional) return Option.none();
      encoded[key] = undefined;
      continue;
    }
    const encodedValue = field.encode(value);
    if (Option.isNone(encodedValue)) return Option.none();
    encoded[key] = encodedValue.value;
  }
  return Option.some(encoded);
};

/**
 * The tag's _Identifier_ is `Docs`-independent (see `DatabaseReaderTag`); only
 * the _Service_ carries `Docs` so writer inputs print the named doc
 * interfaces.
 */
export type DatabaseWriterTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Service<
  DatabaseWriterService<DatabaseSchema_>,
  DatabaseWriterService<DatabaseSchema_, Docs>
>;

export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
): DatabaseWriterService<DatabaseSchema_> => {
  type DataModel_ = DataModel.FromSchema<DatabaseSchema_>;

  const table = <const TableName extends DataModel.TableNames<DataModel_>>(
    tableName: TableName,
  ) => {
    const tableDef = DatabaseSchema.tables(databaseSchema)[tableName];

    const insert = Effect.fn("DatabaseWriter.insert")(function* (
      document: Document.WithoutSystemFields<
        DocumentByName_<DataModel_, TableName>
      >,
    ) {
      const encodedDocument = yield* Document.encode(document, tableDef);

      const id = yield* Effect.promise(() =>
        convexDatabaseWriter.insert(
          tableName,
          encodedDocument as WithoutSystemFields<
            DocumentByName<DataModel.ToConvex<DataModel_>, TableName>
          >,
        ),
      );

      return id;
    });

    const patch = Effect.fn("DatabaseWriter.patch")(function* (
      id: GenericId<TableName>,
      patchedValues: PatchValue<DocumentByName_<DataModel_, TableName>>,
    ) {
      const encodedPatch = Option.flatMap(patchFields(tableDef), (fields) =>
        encodePatch(fields, patchedValues),
      );
      if (Option.isSome(encodedPatch)) {
        const patched = yield* Effect.exit(
          Effect.tryPromise(() =>
            convexDatabaseWriter.patch(
              tableName,
              id,
              encodedPatch.value as Partial<
                DocumentByName<DataModel.ToConvex<DataModel_>, TableName>
              >,
            ),
          ),
        );
        if (Exit.isSuccess(patched)) return;
      }

      const originalDecodedDoc = yield* QueryInitializer.getById<
        Table.AnyWithProps,
        TableName
      >(
        convexDatabaseWriter as any,
        tableDef,
      )(id);

      const updatedEncodedDoc = yield* pipe(
        patchedValues,
        Record.reduce(originalDecodedDoc, (acc, value, key) =>
          value === undefined
            ? Record.remove(acc, key)
            : Record.set(acc, key, value),
        ),
        Document.encode(tableDef),
      );

      yield* Effect.promise(() =>
        convexDatabaseWriter.replace(
          id,
          updatedEncodedDoc as Expand<
            BetterOmit<
              DocumentByName<DataModel.ToConvex<DataModel_>, TableName>,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

    const replace = Effect.fn("DatabaseWriter.replace")(function* (
      id: GenericId<TableName>,
      value: Document.WithoutSystemFields<
        DocumentByName_<DataModel_, TableName>
      >,
    ) {
      const updatedEncodedDoc = yield* Document.encode(value, tableDef);

      yield* Effect.promise(() =>
        convexDatabaseWriter.replace(
          id,
          updatedEncodedDoc as Expand<
            BetterOmit<
              DocumentByName<DataModel.ToConvex<DataModel_>, TableName>,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

    const delete_ = (id: GenericId<TableName>) =>
      Effect.promise(() => convexDatabaseWriter.delete(id));

    return {
      insert,
      patch,
      replace,
      delete: delete_,
    };
  };

  return {
    table,
  } as DatabaseWriterService<DatabaseSchema_>;
};

export const DatabaseWriter = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseWriterTag<DatabaseSchema_, Docs> =>
  Context.Service<
    DatabaseWriterService<DatabaseSchema_>,
    DatabaseWriterService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseWriter");

export type DatabaseWriter<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseWriterService<DatabaseSchema_>;

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(
    DatabaseWriter<DatabaseSchema_>(),
    make(databaseSchema, convexDatabaseWriter),
  );
