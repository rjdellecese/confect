import * as String from "effect/String";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BuildError, isBuildError } from "./BuildError";
import { SnapshotError } from "./SnapshotError";
import * as Ansi from "./Ansi";
import { formatPath, renderBuildError } from "./log";

// --- Variants ---

export class MissingImplFileError extends Schema.TaggedError<
  MissingImplFileError,
  { readonly brand: unique symbol }
>()("MissingImplFileError", {
  specPath: Schema.String,
  expectedImplPath: Schema.String,
}) {}

export class MissingSpecFileError extends Schema.TaggedError<
  MissingSpecFileError,
  { readonly brand: unique symbol }
>()("MissingSpecFileError", {
  implPath: Schema.String,
  expectedSpecPath: Schema.String,
}) {}

export class SpecMissingDefaultGroupSpecError extends Schema.TaggedError<
  SpecMissingDefaultGroupSpecError,
  { readonly brand: unique symbol }
>()("SpecMissingDefaultGroupSpecError", {
  specPath: Schema.String,
}) {}

export class SpecImportsServerError extends Schema.TaggedError<
  SpecImportsServerError,
  { readonly brand: unique symbol }
>()("SpecImportsServerError", {
  specPath: Schema.String,
  importerPaths: Schema.Array(Schema.String),
}) {}

export class InvalidMiddlewareAttachmentError extends Schema.TaggedError<
  InvalidMiddlewareAttachmentError,
  { readonly brand: unique symbol }
>()("InvalidMiddlewareAttachmentError", {
  specPath: Schema.String,
  message: Schema.String,
}) {}

export class ImplMissingSpecImportError extends Schema.TaggedError<
  ImplMissingSpecImportError,
  { readonly brand: unique symbol }
>()("ImplMissingSpecImportError", {
  implPath: Schema.String,
  expectedSpecPath: Schema.String,
}) {}

export class ImplMissingDefaultLayerError extends Schema.TaggedError<
  ImplMissingDefaultLayerError,
  { readonly brand: unique symbol }
>()("ImplMissingDefaultLayerError", {
  implPath: Schema.String,
}) {}

export class ImplNotFinalizedError extends Schema.TaggedError<
  ImplNotFinalizedError,
  { readonly brand: unique symbol }
>()("ImplNotFinalizedError", {
  implPath: Schema.String,
}) {}

export class ImplMissingFunctionsError extends Schema.TaggedError<
  ImplMissingFunctionsError,
  { readonly brand: unique symbol }
>()("ImplMissingFunctionsError", {
  implPath: Schema.String,
  groupPath: Schema.String,
  missingFunctionNames: Schema.Array(Schema.String),
}) {}

export class ImplMissingMiddlewareError extends Schema.TaggedError<
  ImplMissingMiddlewareError,
  { readonly brand: unique symbol }
>()("ImplMissingMiddlewareError", {
  implPath: Schema.String,
  groupPath: Schema.String,
  missingMiddlewareKeys: Schema.Array(Schema.String),
}) {}

export class ParentChildNameCollisionError extends Schema.TaggedError<
  ParentChildNameCollisionError,
  { readonly brand: unique symbol }
>()("ParentChildNameCollisionError", {
  parentSpecPath: Schema.String,
  childSpecPath: Schema.String,
  collisionName: Schema.String,
  collisionKind: Schema.Literals(["function", "group"]),
}) {}

export class InvalidTableDefaultExportError extends Schema.TaggedError<
  InvalidTableDefaultExportError,
  { readonly brand: unique symbol }
>()("InvalidTableDefaultExportError", {
  tablePath: Schema.String,
}) {}

export class InvalidTableFilenameError extends Schema.TaggedError<
  InvalidTableFilenameError,
  { readonly brand: unique symbol }
>()("InvalidTableFilenameError", {
  tablePath: Schema.String,
  reason: Schema.String,
}) {}

export class DuplicateTableNameError extends Schema.TaggedError<
  DuplicateTableNameError,
  { readonly brand: unique symbol }
>()("DuplicateTableNameError", {
  // Every table name that more than one file resolves to, each paired with
  // the colliding file paths. All collisions are captured in a single pass
  // so the user can fix them together rather than re-running codegen once
  // per conflict.
  collisions: Schema.Array(
    Schema.Struct({
      tableName: Schema.String,
      tablePaths: Schema.Array(Schema.String),
    }),
  ),
}) {}

export class LegacySchemaFileError extends Schema.TaggedError<
  LegacySchemaFileError,
  { readonly brand: unique symbol }
>()("LegacySchemaFileError", {
  schemaPath: Schema.String,
}) {}

export class ConflictingDocNameError extends Schema.TaggedError<
  ConflictingDocNameError,
  { readonly brand: unique symbol }
>()("ConflictingDocNameError", {
  collisions: Schema.Array(
    Schema.Struct({
      docName: Schema.String,
      tableNames: Schema.Array(Schema.String),
    }),
  ),
}) {}

export class InvalidConvexConfigError extends Schema.TaggedError<
  InvalidConvexConfigError,
  { readonly brand: unique symbol }
>()("InvalidConvexConfigError", {
  configPath: Schema.String,
  reason: Schema.String,
}) {}

export const CodegenError = Schema.Union([
  SnapshotError,
  BuildError,
  MissingImplFileError,
  MissingSpecFileError,
  SpecMissingDefaultGroupSpecError,
  SpecImportsServerError,
  InvalidMiddlewareAttachmentError,
  ImplMissingSpecImportError,
  ImplMissingDefaultLayerError,
  ImplNotFinalizedError,
  ImplMissingFunctionsError,
  ImplMissingMiddlewareError,
  ParentChildNameCollisionError,
  InvalidTableDefaultExportError,
  InvalidTableFilenameError,
  DuplicateTableNameError,
  LegacySchemaFileError,
  ConflictingDocNameError,
  InvalidConvexConfigError,
]);
export type CodegenError = typeof CodegenError.Type;

export const isCodegenError = (error: unknown): error is CodegenError => {
  if (isBuildError(error)) return true;
  return Schema.is(CodegenError)(error);
};

// --- Per-variant rendering ---

const cross = Ansi.red("✘");

const stemFromSpecPath = (specPath: string): string => {
  const lastSep = Math.max(
    Option.getOrElse(String.lastIndexOf("/")(specPath), () => -1),
    Option.getOrElse(String.lastIndexOf("\\")(specPath), () => -1),
  );
  const basename = lastSep < 0 ? specPath : String.slice(lastSep + 1)(specPath);
  return String.endsWith(".spec.ts")(basename)
    ? String.slice(0, -".spec.ts".length)(basename)
    : basename;
};

const singleLine = (...parts: ReadonlyArray<string>): string =>
  `${cross} ${Array.join(parts, "")}`;

const renderMissingImplFileError = (error: MissingImplFileError): string =>
  singleLine(
    "Spec ",
    formatPath(error.specPath),
    " has no sibling impl; create ",
    formatPath(error.expectedImplPath),
    " and default-export a GroupImpl layer from it.",
  );

const renderMissingSpecFileError = (error: MissingSpecFileError): string =>
  singleLine(
    "Impl ",
    formatPath(error.implPath),
    " has no sibling spec; create ",
    formatPath(error.expectedSpecPath),
    " and default-export a GroupSpec from it, or remove the impl.",
  );

const renderSpecMissingDefaultGroupSpecError = (
  error: SpecMissingDefaultGroupSpecError,
): string =>
  singleLine(
    "Spec ",
    formatPath(error.specPath),
    " must default-export a GroupSpec; build it with GroupSpec.make() or GroupSpec.makeNode().",
  );

const renderSpecImportsServerError = (
  error: SpecImportsServerError,
): string => {
  const importers = Array.join(error.importerPaths, ", ");
  return singleLine(
    "Spec ",
    formatPath(error.specPath),
    ` reaches a module that imports \`@confect/server\`: ${importers}. Spec modules are bundled into your client, so anything they import ships to the browser—move the server logic into a \`*.impl.ts\` module, or use \`import type\` if you only need the types.`,
  );
};

const renderImplMissingSpecImportError = (
  error: ImplMissingSpecImportError,
): string => {
  const stem = stemFromSpecPath(error.expectedSpecPath);
  return singleLine(
    "Impl ",
    formatPath(error.implPath),
    ` does not import its sibling spec; add \`import ${stem} from "./${stem}.spec"\` and pass it to FunctionImpl.make/GroupImpl.make.`,
  );
};

const renderImplMissingDefaultLayerError = (
  error: ImplMissingDefaultLayerError,
): string =>
  singleLine(
    "Impl ",
    formatPath(error.implPath),
    " must default-export a GroupImpl layer; wrap your handlers with `GroupImpl.make(databaseSchema, groupSpec).pipe(Layer.provide(...))` and `export default` it.",
  );

const renderImplNotFinalizedError = (error: ImplNotFinalizedError): string =>
  singleLine(
    "Impl ",
    formatPath(error.implPath),
    " is not finalized; append `GroupImpl.finalize` to the end of the pipeline (e.g. `GroupImpl.make(databaseSchema, group).pipe(Layer.provide(...), GroupImpl.finalize)`).",
  );

const renderImplMissingFunctionsError = (
  error: ImplMissingFunctionsError,
): string => {
  const names = Array.join(error.missingFunctionNames, ", ");
  return singleLine(
    "Impl ",
    formatPath(error.implPath),
    ` does not implement every function declared by group \`${error.groupPath}\`; missing: ${names}. Add a \`FunctionImpl.make\` for each missing function and provide it to the group layer.`,
  );
};

const renderImplMissingMiddlewareError = (
  error: ImplMissingMiddlewareError,
): string => {
  const keys = Array.join(error.missingMiddlewareKeys, ", ");
  return singleLine(
    "Impl ",
    formatPath(error.implPath),
    ` does not implement every middleware attached to group \`${error.groupPath}\`; missing: ${keys}. Provide a \`MiddlewareImpl.make\` (or \`makeByFunctionType\`/\`provides\`) layer for each missing middleware to the group layer.`,
  );
};

const renderInvalidTableDefaultExportError = (
  error: InvalidTableDefaultExportError,
): string =>
  singleLine(
    "Table ",
    formatPath(error.tablePath),
    " must default-export a Table (e.g. `export default Table.make({ ... })`); convert any named export to a default export.",
  );

const renderInvalidTableFilenameError = (
  error: InvalidTableFilenameError,
): string =>
  singleLine(
    "Table ",
    formatPath(error.tablePath),
    ` has an invalid filename: ${error.reason} Convex table names must start with a letter and contain only letters, numbers, and underscores; leading underscores are reserved for system tables.`,
  );

const renderDuplicateTableNameError = (
  error: DuplicateTableNameError,
): string => {
  const conflicts = Array.join(
    Array.map(
      error.collisions,
      ({ tableName, tablePaths }) =>
        `\`${tableName}\` (${Array.join(tablePaths, ", ")})`,
    ),
    "; ",
  );
  return singleLine(
    `Multiple files under \`confect/tables/\` resolve to the same table name. Table names are derived from filenames, so each must be unique across the directory (including subdirectories); rename or remove all but one. Conflicts: ${conflicts}.`,
  );
};

const renderConflictingDocNameError = (
  error: ConflictingDocNameError,
): string => {
  const conflicts = pipe(
    error.collisions,
    Array.map(
      ({ docName, tableNames }) =>
        `\`${docName}\` (${Array.join(tableNames, ", ")})`,
    ),
    Array.join("; "),
  );
  return singleLine(
    `Multiple tables fold to the same generated document type name. Table names are converted to PascalCase (so \`user_profiles\` and \`userProfiles\` both become \`UserProfilesDoc\`); rename all but one of each colliding group. Conflicts: ${conflicts}.`,
  );
};

const renderInvalidConvexConfigError = (
  error: InvalidConvexConfigError,
): string =>
  singleLine(
    "Convex config ",
    formatPath(error.configPath),
    ` could not be evaluated: ${error.reason}`,
  );

const renderLegacySchemaFileError = (error: LegacySchemaFileError): string =>
  singleLine(
    "Found a legacy ",
    formatPath(error.schemaPath),
    ". Delete it: tables in `confect/tables/*.ts` are now the single source of truth, and the runtime schema is generated as `confect/_generated/schema.ts`.",
  );

const renderParentChildNameCollisionError = (
  error: ParentChildNameCollisionError,
): string =>
  singleLine(
    "Spec ",
    formatPath(error.parentSpecPath),
    ` declares a ${error.collisionKind} \`${error.collisionName}\` whose name collides with the sibling subdirectory spec `,
    formatPath(error.childSpecPath),
    `. Rename one of them so the assembled spec has a unique key at this path.`,
  );

/**
 * Render any {@link CodegenError} into a styled, ready-to-print string.
 * Single-error variants render to a one-line `✘`-prefixed message;
 * `BundleFailedError` (the only multi-error variant) renders to a header plus
 * an esbuild diagnostic block.
 */
export const renderCodegenError = (error: CodegenError): string => {
  if (isBuildError(error)) return renderBuildError(error);
  return Match.value(error).pipe(
    Match.tag("SnapshotError", ({ reason, relativePath, pathSegments }) =>
      singleLine(
        `Invalid generation metadata (${reason})`,
        relativePath === "" ? "" : ` for ${relativePath}`,
        pathSegments.length === 0
          ? "."
          : ` at ${Array.join(pathSegments, "/")}.`,
      ),
    ),
    Match.tag("MissingImplFileError", renderMissingImplFileError),
    Match.tag("MissingSpecFileError", renderMissingSpecFileError),
    Match.tag(
      "SpecMissingDefaultGroupSpecError",
      renderSpecMissingDefaultGroupSpecError,
    ),
    Match.tag("SpecImportsServerError", renderSpecImportsServerError),
    Match.tag("InvalidMiddlewareAttachmentError", (attachmentError) =>
      singleLine(
        "Spec ",
        formatPath(attachmentError.specPath),
        `: ${attachmentError.message}`,
      ),
    ),
    Match.tag("ImplMissingSpecImportError", renderImplMissingSpecImportError),
    Match.tag(
      "ImplMissingDefaultLayerError",
      renderImplMissingDefaultLayerError,
    ),
    Match.tag("ImplNotFinalizedError", renderImplNotFinalizedError),
    Match.tag("ImplMissingFunctionsError", renderImplMissingFunctionsError),
    Match.tag("ImplMissingMiddlewareError", renderImplMissingMiddlewareError),
    Match.tag(
      "ParentChildNameCollisionError",
      renderParentChildNameCollisionError,
    ),
    Match.tag(
      "InvalidTableDefaultExportError",
      renderInvalidTableDefaultExportError,
    ),
    Match.tag("InvalidTableFilenameError", renderInvalidTableFilenameError),
    Match.tag("DuplicateTableNameError", renderDuplicateTableNameError),
    Match.tag("LegacySchemaFileError", renderLegacySchemaFileError),
    Match.tag("ConflictingDocNameError", renderConflictingDocNameError),
    Match.tag("InvalidConvexConfigError", renderInvalidConvexConfigError),
    Match.exhaustive,
  );
};

export const logCodegenError = (error: CodegenError) =>
  pipe(error, renderCodegenError, Console.error);

// --- Effect combinators ---

/**
 * Log any {@link CodegenError} thrown by `effect` and propagate the failure
 * unchanged so the caller's error channel is preserved.
 */
export const tapAndLog = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tapError((error) =>
      isCodegenError(error) ? logCodegenError(error) : Effect.void,
    ),
  );

/**
 * Catch any {@link CodegenError} thrown by `effect`, log it, and resolve to
 * `Option.none()`. Success resolves to `Option.some(value)`.
 */
// oxlint-disable effecttsgo/unsafe-effect-type-assertion -- catchIf removes the error variant selected by this refinement.
export const catchAndLog = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, Exclude<E, CodegenError>, R> =>
  Effect.catchIf(
    Effect.map(effect, Option.some<A>),
    (error: E): error is E & CodegenError => isCodegenError(error),
    (error: E & CodegenError) =>
      logCodegenError(error).pipe(Effect.as(Option.none<A>())),
  ) as Effect.Effect<Option.Option<A>, Exclude<E, CodegenError>, R>;
