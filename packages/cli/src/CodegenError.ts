import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import { Effect, Match, Option, pipe, Schema } from "effect";
import { BuildError, isBuildError, renderBuildError } from "./BuildError";
import { formatPathDoc } from "./log";

// --- Variants ---

export class MissingImplFileError extends Schema.TaggedError<MissingImplFileError>()(
  "MissingImplFileError",
  {
    specPath: Schema.String,
    expectedImplPath: Schema.String,
  },
) {}

export class MissingSpecFileError extends Schema.TaggedError<MissingSpecFileError>()(
  "MissingSpecFileError",
  {
    implPath: Schema.String,
    expectedSpecPath: Schema.String,
  },
) {}

export class SpecMissingDefaultGroupSpecError extends Schema.TaggedError<SpecMissingDefaultGroupSpecError>()(
  "SpecMissingDefaultGroupSpecError",
  {
    specPath: Schema.String,
  },
) {}

export class SpecRuntimeMismatchError extends Schema.TaggedError<SpecRuntimeMismatchError>()(
  "SpecRuntimeMismatchError",
  {
    specPath: Schema.String,
    expectedRuntime: Schema.Literal("Convex", "Node"),
    actualRuntime: Schema.Literal("Convex", "Node"),
  },
) {}

export class ImplMissingSpecImportError extends Schema.TaggedError<ImplMissingSpecImportError>()(
  "ImplMissingSpecImportError",
  {
    implPath: Schema.String,
    expectedSpecPath: Schema.String,
  },
) {}

export class ImplMissingDefaultLayerError extends Schema.TaggedError<ImplMissingDefaultLayerError>()(
  "ImplMissingDefaultLayerError",
  {
    implPath: Schema.String,
  },
) {}

export class ImplNotFinalizedError extends Schema.TaggedError<ImplNotFinalizedError>()(
  "ImplNotFinalizedError",
  {
    implPath: Schema.String,
  },
) {}

export class ImplMissingFunctionsError extends Schema.TaggedError<ImplMissingFunctionsError>()(
  "ImplMissingFunctionsError",
  {
    implPath: Schema.String,
    groupPath: Schema.String,
    missingFunctionNames: Schema.Array(Schema.String),
  },
) {}

export class ParentChildNameCollisionError extends Schema.TaggedError<ParentChildNameCollisionError>()(
  "ParentChildNameCollisionError",
  {
    parentSpecPath: Schema.String,
    childSpecPath: Schema.String,
    collisionName: Schema.String,
    collisionKind: Schema.Literal("function", "group"),
  },
) {}

export class InvalidTableDefaultExportError extends Schema.TaggedError<InvalidTableDefaultExportError>()(
  "InvalidTableDefaultExportError",
  {
    tablePath: Schema.String,
  },
) {}

export class InvalidTableFilenameError extends Schema.TaggedError<InvalidTableFilenameError>()(
  "InvalidTableFilenameError",
  {
    tablePath: Schema.String,
    reason: Schema.String,
  },
) {}

export class LegacySchemaFileError extends Schema.TaggedError<LegacySchemaFileError>()(
  "LegacySchemaFileError",
  {
    schemaPath: Schema.String,
  },
) {}

export const CodegenError = Schema.Union(
  BuildError,
  MissingImplFileError,
  MissingSpecFileError,
  SpecMissingDefaultGroupSpecError,
  SpecRuntimeMismatchError,
  ImplMissingSpecImportError,
  ImplMissingDefaultLayerError,
  ImplNotFinalizedError,
  ImplMissingFunctionsError,
  ParentChildNameCollisionError,
  InvalidTableDefaultExportError,
  InvalidTableFilenameError,
  LegacySchemaFileError,
);
export type CodegenError = typeof CodegenError.Type;

export const isCodegenError = (error: unknown): error is CodegenError => {
  if (isBuildError(error)) return true;
  return Schema.is(CodegenError)(error);
};

// --- Per-variant rendering ---

const cross = pipe(AnsiDoc.char("✘"), AnsiDoc.annotate(Ansi.red));

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

const singleLine = (
  ...parts: ReadonlyArray<AnsiDoc.AnsiDoc>
): AnsiDoc.AnsiDoc => pipe(cross, AnsiDoc.catWithSpace(AnsiDoc.hcat(parts)));

const renderMissingImplFileError = (
  error: MissingImplFileError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Spec "),
    formatPathDoc(error.specPath),
    AnsiDoc.text(" has no sibling impl; create "),
    formatPathDoc(error.expectedImplPath),
    AnsiDoc.text(" and default-export a GroupImpl layer from it."),
  );

const renderMissingSpecFileError = (
  error: MissingSpecFileError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Impl "),
    formatPathDoc(error.implPath),
    AnsiDoc.text(" has no sibling spec; create "),
    formatPathDoc(error.expectedSpecPath),
    AnsiDoc.text(
      " and default-export a GroupSpec from it, or remove the impl.",
    ),
  );

const renderSpecMissingDefaultGroupSpecError = (
  error: SpecMissingDefaultGroupSpecError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Spec "),
    formatPathDoc(error.specPath),
    AnsiDoc.text(
      " must default-export a GroupSpec; build it with GroupSpec.make() or GroupSpec.makeNode().",
    ),
  );

const renderSpecRuntimeMismatchError = (
  error: SpecRuntimeMismatchError,
): AnsiDoc.AnsiDoc => {
  const constructor =
    error.expectedRuntime === "Node"
      ? "GroupSpec.makeNode()"
      : "GroupSpec.make()";
  const moveHint =
    error.expectedRuntime === "Node"
      ? " or move the file into confect/node/."
      : " or move the file out of confect/node/.";
  return singleLine(
    AnsiDoc.text("Spec "),
    formatPathDoc(error.specPath),
    AnsiDoc.text(
      ` declares a ${error.actualRuntime} GroupSpec but its location requires ${error.expectedRuntime}; use ${constructor}${moveHint}`,
    ),
  );
};

const renderImplMissingSpecImportError = (
  error: ImplMissingSpecImportError,
): AnsiDoc.AnsiDoc => {
  const stem = stemFromSpecPath(error.expectedSpecPath);
  return singleLine(
    AnsiDoc.text("Impl "),
    formatPathDoc(error.implPath),
    AnsiDoc.text(
      ` does not import its sibling spec; add \`import ${stem} from "./${stem}.spec"\` and pass it to FunctionImpl.make / GroupImpl.make.`,
    ),
  );
};

const renderImplMissingDefaultLayerError = (
  error: ImplMissingDefaultLayerError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Impl "),
    formatPathDoc(error.implPath),
    AnsiDoc.text(
      " must default-export a GroupImpl layer; wrap your handlers with `GroupImpl.make(api, groupSpec).pipe(Layer.provide(...))` and `export default` it.",
    ),
  );

const renderImplNotFinalizedError = (
  error: ImplNotFinalizedError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Impl "),
    formatPathDoc(error.implPath),
    AnsiDoc.text(
      " is not finalized; append `GroupImpl.finalize` to the end of the pipeline (e.g. `GroupImpl.make(api, group).pipe(Layer.provide(...), GroupImpl.finalize)`).",
    ),
  );

const renderImplMissingFunctionsError = (
  error: ImplMissingFunctionsError,
): AnsiDoc.AnsiDoc => {
  const names = error.missingFunctionNames.join(", ");
  return singleLine(
    AnsiDoc.text("Impl "),
    formatPathDoc(error.implPath),
    AnsiDoc.text(
      ` does not implement every function declared by group \`${error.groupPath}\`; missing: ${names}. Add a \`FunctionImpl.make\` for each missing function and provide it to the group layer.`,
    ),
  );
};

const renderInvalidTableDefaultExportError = (
  error: InvalidTableDefaultExportError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Table "),
    formatPathDoc(error.tablePath),
    AnsiDoc.text(
      " must default-export a Table (e.g. `export default Table.make({ ... })`); convert any named export to a default export.",
    ),
  );

const renderInvalidTableFilenameError = (
  error: InvalidTableFilenameError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Table "),
    formatPathDoc(error.tablePath),
    AnsiDoc.text(
      ` has an invalid filename: ${error.reason} Convex table names must start with a letter and contain only letters, numbers, and underscores; leading underscores are reserved for system tables.`,
    ),
  );

const renderLegacySchemaFileError = (
  error: LegacySchemaFileError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Found a legacy "),
    formatPathDoc(error.schemaPath),
    AnsiDoc.text(
      ". Delete it: tables in `confect/tables/*.ts` are now the single source of truth, and the runtime schema is generated as `confect/_generated/schema.ts`.",
    ),
  );

const renderParentChildNameCollisionError = (
  error: ParentChildNameCollisionError,
): AnsiDoc.AnsiDoc =>
  singleLine(
    AnsiDoc.text("Spec "),
    formatPathDoc(error.parentSpecPath),
    AnsiDoc.text(
      ` declares a ${error.collisionKind} \`${error.collisionName}\` whose name collides with the sibling subdirectory spec `,
    ),
    formatPathDoc(error.childSpecPath),
    AnsiDoc.text(
      `. Rename one of them so the assembled spec has a unique key at this path.`,
    ),
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
    Match.tag("MissingImplFileError", (e) =>
      pipe(renderMissingImplFileError(e), AnsiDoc.render({ style: "pretty" })),
    ),
    Match.tag("MissingSpecFileError", (e) =>
      pipe(renderMissingSpecFileError(e), AnsiDoc.render({ style: "pretty" })),
    ),
    Match.tag("SpecMissingDefaultGroupSpecError", (e) =>
      pipe(
        renderSpecMissingDefaultGroupSpecError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("SpecRuntimeMismatchError", (e) =>
      pipe(
        renderSpecRuntimeMismatchError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("ImplMissingSpecImportError", (e) =>
      pipe(
        renderImplMissingSpecImportError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("ImplMissingDefaultLayerError", (e) =>
      pipe(
        renderImplMissingDefaultLayerError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("ImplNotFinalizedError", (e) =>
      pipe(renderImplNotFinalizedError(e), AnsiDoc.render({ style: "pretty" })),
    ),
    Match.tag("ImplMissingFunctionsError", (e) =>
      pipe(
        renderImplMissingFunctionsError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("ParentChildNameCollisionError", (e) =>
      pipe(
        renderParentChildNameCollisionError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("InvalidTableDefaultExportError", (e) =>
      pipe(
        renderInvalidTableDefaultExportError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("InvalidTableFilenameError", (e) =>
      pipe(
        renderInvalidTableFilenameError(e),
        AnsiDoc.render({ style: "pretty" }),
      ),
    ),
    Match.tag("LegacySchemaFileError", (e) =>
      pipe(renderLegacySchemaFileError(e), AnsiDoc.render({ style: "pretty" })),
    ),
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
