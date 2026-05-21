import { Schema } from "effect";
import type * as esbuild from "esbuild";

export class ImplValidationError extends Schema.TaggedError<ImplValidationError>()(
  "ImplValidationError",
  {
    file: Schema.String,
    reason: Schema.String,
  },
) {
  override get message(): string {
    return `${this.file}: ${this.reason}`;
  }
}

export class SpecBuildError extends Schema.TaggedError<SpecBuildError>()(
  "SpecBuildError",
  {
    file: Schema.String,
    errors: Schema.Array(Schema.Unknown),
  },
) {
  override get message(): string {
    return `${this.file}: build errors`;
  }
}

export class SpecImportFailedError extends Schema.TaggedError<SpecImportFailedError>()(
  "SpecImportFailedError",
  {
    file: Schema.String,
    cause: Schema.Unknown,
  },
) {
  override get message(): string {
    return `${this.file}: failed to import bundled module: ${String(this.cause)}`;
  }
}

export class SchemaValidationError extends Schema.TaggedError<SchemaValidationError>()(
  "SchemaValidationError",
  {
    file: Schema.String,
    reason: Schema.String,
  },
) {
  override get message(): string {
    return `${this.file}: ${this.reason}`;
  }
}

export class BundlerError extends Schema.TaggedError<BundlerError>()(
  "BundlerError",
  {
    cause: Schema.Unknown,
  },
) {}

export type CodegenUserError =
  | ImplValidationError
  | SpecBuildError
  | SpecImportFailedError
  | SchemaValidationError;

export const isBuildFailure = (error: unknown): error is esbuild.BuildFailure =>
  typeof error === "object" &&
  error !== null &&
  "errors" in error &&
  Array.isArray((error as esbuild.BuildFailure).errors);

export const mapBundleError = (file: string, error: BundlerError) => {
  const cause = error.cause;
  return isBuildFailure(cause)
    ? new SpecBuildError({ file, errors: cause.errors })
    : new SpecImportFailedError({ file, cause });
};
