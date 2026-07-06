import * as Schema from "effect/Schema";
import type * as esbuild from "esbuild";

// --- Variants ---

export class BundleFailedError extends Schema.TaggedErrorClass<BundleFailedError>()(
  "BundleFailedError",
  {
    file: Schema.String,
    errors: Schema.Array(Schema.Unknown),
  },
) {}

export class ImportFailedError extends Schema.TaggedErrorClass<ImportFailedError>()(
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
 * remapped to a {@link BuildError} (which carries enough context for the CLI
 * to render it) before reaching a user-surface boundary.
 */
export class BundlerError extends Schema.TaggedErrorClass<BundlerError>()(
  "BundlerError",
  {
    cause: Schema.Unknown,
  },
) {}

const isEsbuildBuildFailure = (error: unknown): error is esbuild.BuildFailure =>
  typeof error === "object" &&
  error !== null &&
  "errors" in error &&
  globalThis.Array.isArray((error as esbuild.BuildFailure).errors);

export const fromBundlerError = (
  file: string,
  error: BundlerError,
): BuildError =>
  isEsbuildBuildFailure(error.cause)
    ? new BundleFailedError({ file, errors: error.cause.errors })
    : new ImportFailedError({ file, cause: error.cause });
