import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BuildError, isBuildError } from "./BuildError";
import * as Ansi from "./Ansi";
import { formatPath, renderBuildError } from "./log";

// --- Variants ---

export class MissingImplFileError extends Schema.TaggedErrorClass<MissingImplFileError>()(
  "MissingImplFileError",
  {
    specPath: Schema.String,
    expectedImplPath: Schema.String,
  },
) {}

export class MissingSpecFileError extends Schema.TaggedErrorClass<MissingSpecFileError>()(
  "MissingSpecFileError",
  {
    implPath: Schema.String,
    expectedSpecPath: Schema.String,
  },
) {}

export class SpecMissingDefaultGroupSpecError extends Schema.TaggedErrorClass<SpecMissingDefaultGroupSpecError>()(
  "SpecMissingDefaultGroupSpecError",
  {
    specPath: Schema.String,
  },
) {}

export class ImplMissingSpecImportError extends Schema.TaggedErrorClass<ImplMissingSpecImportError>()(
  "ImplMissingSpecImportError",
  {
    implPath: Schema.String,
    expectedSpecPath: Schema.String,
  },
) {}

export class ImplMissingDefaultLayerError extends Schema.TaggedErrorClass<ImplMissingDefaultLayerError>()(
  "ImplMissingDefaultLayerError",
  {
    implPath: Schema.String,
  },
) {}

export class ImplNotFinalizedError extends Schema.TaggedErrorClass<ImplNotFinalizedError>()(
  "ImplNotFinalizedError",
  {
    implPath: Schema.String,
  },
) {}

export class ImplMissingFunctionsError extends Schema.TaggedErrorClass<ImplMissingFunctionsError>()(
  "ImplMissingFunctionsError",
  {
    implPath: Schema.String,
    groupPath: Schema.String,
    missingFunctionNames: Schema.Array(Schema.String),
  },
) {}

export class ParentChildNameCollisionError extends Schema.TaggedErrorClass<ParentChildNameCollisionError>()(
  "ParentChildNameCollisionError",
  {
    parentSpecPath: Schema.String,
    childSpecPath: Schema.String,
    collisionName: Schema.String,
    collisionKind: Schema.Literals(["function", "group"]),
  },
) {}

export class InvalidTableDefaultExportError extends Schema.TaggedErrorClass<InvalidTableDefaultExportError>()(
  "InvalidTableDefaultExportError",
  {
    tablePath: Schema.String,
  },
) {}

export class InvalidTableFilenameError extends Schema.TaggedErrorClass<InvalidTableFilenameError>()(
  "InvalidTableFilenameError",
  {
    tablePath: Schema.String,
    reason: Schema.String,
  },
) {}

export class DuplicateTableNameError extends Schema.TaggedErrorClass<DuplicateTableNameError>()(
  "DuplicateTableNameError",
  {
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
  },
) {}

export class LegacySchemaFileError extends Schema.TaggedErrorClass<LegacySchemaFileError>()(
  "LegacySchemaFileError",
  {
    schemaPath: Schema.String,
  },
) {}

export class ConflictingDocNameError extends Schema.TaggedErrorClass<ConflictingDocNameError>()(
  "ConflictingDocNameError",
  {
    collisions: Schema.Array(
      Schema.Struct({
        docName: Schema.String,
        tableNames: Schema.Array(Schema.String),
      }),
    ),
  },
) {}

export class InvalidConvexConfigError extends Schema.TaggedErrorClass<InvalidConvexConfigError>()(
  "InvalidConvexConfigError",
  {
    configPath: Schema.String,
    reason: Schema.String,
  },
) {}

export const CodegenError = Schema.Union([
  BuildError,
  MissingImplFileError,
  MissingSpecFileError,
  SpecMissingDefaultGroupSpecError,
  ImplMissingSpecImportError,
  ImplMissingDefaultLayerError,
  ImplNotFinalizedError,
  ImplMissingFunctionsError,
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
    specPath.lastIndexOf("/"),
    specPath.lastIndexOf("\\"),
  );
  const basename = lastSep < 0 ? specPath : specPath.slice(lastSep + 1);
  return basename.endsWith(".spec.ts")
    ? basename.slice(0, -".spec.ts".length)
    : basename;
};

const singleLine = (...parts: ReadonlyArray<string>): string =>
  `${cross} ${parts.join("")}`;

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

const renderImplMissingSpecImportError = (
  error: ImplMissingSpecImportError,
): string => {
  const stem = stemFromSpecPath(error.expectedSpecPath);
  return singleLine(
    "Impl ",
    formatPath(error.implPath),
    ` does not import its sibling spec; add \`import ${stem} from "./${stem}.spec"\` and pass it to FunctionImpl.make / GroupImpl.make.`,
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
  const names = error.missingFunctionNames.join(", ");
  return singleLine(
    "Impl ",
    formatPath(error.implPath),
    ` does not implement every function declared by group \`${error.groupPath}\`; missing: ${names}. Add a \`FunctionImpl.make\` for each missing function and provide it to the group layer.`,
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
  const conflicts = error.collisions
    .map(
      ({ tableName, tablePaths }) =>
        `\`${tableName}\` (${tablePaths.join(", ")})`,
    )
    .join("; ");
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
 * `BundleFailedError` (the only multi-error variant) renders to a header
 * plus an esbuild diagnostic block.
 */
export const renderCodegenError = (error: CodegenError): string => {
  if (isBuildError(error)) return renderBuildError(error);
  return Match.value(error).pipe(
    Match.tag("MissingImplFileError", renderMissingImplFileError),
    Match.tag("MissingSpecFileError", renderMissingSpecFileError),
    Match.tag(
      "SpecMissingDefaultGroupSpecError",
      renderSpecMissingDefaultGroupSpecError,
    ),
    Match.tag("ImplMissingSpecImportError", renderImplMissingSpecImportError),
    Match.tag(
      "ImplMissingDefaultLayerError",
      renderImplMissingDefaultLayerError,
    ),
    Match.tag("ImplNotFinalizedError", renderImplNotFinalizedError),
    Match.tag("ImplMissingFunctionsError", renderImplMissingFunctionsError),
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
  Effect.sync(() => console.error(renderCodegenError(error)));

// --- Effect combinators ---

/**
 * Log any {@link CodegenError} thrown by `effect` and propagate the failure
 * unchanged so the caller's error channel is preserved (used by the
 * `codegen` command, which needs the failure to surface as a non-zero exit
 * code).
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
 * `Option.none()` (used by the `dev` command's sync loop, which continues
 * after a failed sync rather than exiting). Success resolves to
 * `Option.some(value)`.
 */
export const catchAndLog = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, Exclude<E, CodegenError>, R> =>
  Effect.catchIf(Effect.map(effect, Option.some<A>), isCodegenError, (error) =>
    logCodegenError(error).pipe(Effect.as(Option.none<A>())),
  ) as Effect.Effect<Option.Option<A>, Exclude<E, CodegenError>, R>;
