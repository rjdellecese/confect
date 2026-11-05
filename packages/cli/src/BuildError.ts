import * as Array from "effect/Array";
import * as Schema from "effect/Schema";
import type * as esbuild from "esbuild";

// --- Variants ---

export class BundleFailedError extends Schema.TaggedError<
  BundleFailedError,
  { readonly brand: unique symbol }
>()("BundleFailedError", {
  file: Schema.String,
  errors: Schema.Array(Schema.Unknown),
}) {}

export class ImportFailedError extends Schema.TaggedError<
  ImportFailedError,
  { readonly brand: unique symbol }
>()("ImportFailedError", {
  file: Schema.String,
  cause: Schema.Unknown,
}) {}

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
export class BundlerError extends Schema.TaggedError<
  BundlerError,
  { readonly brand: unique symbol }
>()("BundlerError", {
  cause: Schema.Unknown,
}) {}

const isEsbuildBuildFailure = (error: unknown): error is esbuild.BuildFailure =>
  typeof error === "object" &&
  error !== null &&
  "errors" in error &&
  Array.isArray((error as esbuild.BuildFailure).errors);

export const fromBundlerError = (
  file: string,
  error: BundlerError,
): BuildError =>
  isEsbuildBuildFailure(error.cause)
    ? BundleFailedError.make({ file, errors: error.cause.errors })
    : ImportFailedError.make({ file, cause: error.cause });
