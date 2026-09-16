import * as Schema from "effect/Schema";

// --- Variants ---

const EsbuildLocation = Schema.NullOr(
  Schema.Struct({
    file: Schema.String,
    namespace: Schema.String,
    line: Schema.Finite,
    column: Schema.Finite,
    length: Schema.Finite,
    lineText: Schema.String,
    suggestion: Schema.String,
  }),
);

const EsbuildMessages = Schema.mutable(
  Schema.Array(
    Schema.Struct({
      id: Schema.String,
      pluginName: Schema.String,
      text: Schema.String,
      location: EsbuildLocation,
      notes: Schema.mutable(
        Schema.Array(
          Schema.Struct({ text: Schema.String, location: EsbuildLocation }),
        ),
      ),
      detail: Schema.Unknown,
    }),
  ),
);

export class BundleFailedError extends Schema.TaggedError<BundleFailedError>()(
  "BundleFailedError",
  {
    file: Schema.String,
    errors: Schema.declare(Schema.is(EsbuildMessages)),
  },
) {}

export class ImportFailedError extends Schema.TaggedError<ImportFailedError>()(
  "ImportFailedError",
  {
    file: Schema.String,
    cause: Schema.Unknown,
  },
) {}

export const BuildError = Schema.Union([BundleFailedError, ImportFailedError]);

export type BuildError = typeof BuildError.Type;

export const isBuildError = (error: unknown): error is BuildError =>
  Schema.is(BuildError)(error);

// --- Bundler adapter ---

/**
 * Internal failure produced by the esbuild bundle/import pipeline. Always
 * remapped to a {@link BuildError} (which carries enough context for the CLI to
 * render it) before reaching a user-surface boundary.
 */
export class BundlerError extends Schema.TaggedError<BundlerError>()(
  "BundlerError",
  {
    cause: Schema.Unknown,
  },
) {}

const isEsbuildBuildFailure = Schema.is(
  Schema.Struct({ errors: EsbuildMessages }),
);

export const fromBundlerError = (
  file: string,
  error: BundlerError,
): BuildError =>
  isEsbuildBuildFailure(error.cause)
    ? new BundleFailedError({ file, errors: error.cause.errors })
    : new ImportFailedError({ file, cause: error.cause });
