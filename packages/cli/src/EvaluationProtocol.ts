import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as LogLevel from "effect/LogLevel";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as CodegenError from "./CodegenError";
import * as GenerationSnapshot from "./GenerationSnapshot";
import { FunctionPaths } from "./FunctionPaths";
import { SpecModulePath } from "./SpecModulePath";

export const RequestContext = Schema.Struct({
  projectRoot: Schema.String,
  confectDirectory: Schema.String,
  convexDirectory: Schema.String,
  targetKind: Schema.Literals(["app", "component"]),
  minimumLogLevel: Schema.Literals(LogLevel.values),
});
export type RequestContext = typeof RequestContext.Type;

export class EvaluationError extends Schema.TaggedError<EvaluationError>()(
  "EvaluationError",
  { diagnostic: Schema.String },
) {}

const Error = Schema.Union([CodegenError.CodegenError, EvaluationError]);

export const requests = RpcGroup.make(
  Rpc.make("Previous", {
    payload: Schema.Struct({ ...RequestContext.fields, url: Schema.String }),
    success: FunctionPaths,
    error: Error,
  }),
  Rpc.make("LoadSpec", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      relativePath: SpecModulePath,
      url: Schema.String,
      serverImporters: Schema.Array(Schema.String),
    }),
    success: Schema.Void,
    error: Error,
  }),
  Rpc.make("Snapshot", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      paths: Schema.Array(SpecModulePath),
      previous: Schema.optionalKey(GenerationSnapshot.GenerationSnapshot),
    }),
    success: GenerationSnapshot.GenerationSnapshot,
    error: Error,
  }),
  Rpc.make("ValidateImpl", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      specPath: SpecModulePath,
      url: Schema.String,
      importsSpec: Schema.Boolean,
    }),
    success: Schema.Void,
    error: Error,
  }),
  Rpc.make("ValidateTable", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      relativePath: Schema.String,
      url: Schema.String,
    }),
    success: Schema.Void,
    error: Error,
  }),
  Rpc.make("Components", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      displayPath: Schema.String,
      url: Schema.String,
    }),
    success: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        componentDefinitionPath: Schema.String,
      }),
    ),
    error: Error,
  }),
);

export const catchDiagnostic = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
      const failure = Cause.findErrorOption(cause);
      return Effect.fail(
        Option.isSome(failure) && Schema.is(EvaluationError)(failure.value)
          ? failure.value
          : new EvaluationError({
              diagnostic:
                Option.isSome(failure) &&
                CodegenError.isCodegenError(failure.value)
                  ? CodegenError.renderCodegenError(failure.value)
                  : Cause.pretty(cause),
            }),
      );
    }),
  );

export const catchWorkerFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
      const failure = Cause.findErrorOption(cause);
      const error: CodegenError.CodegenError | EvaluationError =
        Option.isSome(failure) &&
        (CodegenError.isCodegenError(failure.value) ||
          Schema.is(EvaluationError)(failure.value))
          ? failure.value
          : new EvaluationError({ diagnostic: Cause.pretty(cause) });
      return Effect.fail(error);
    }),
  );
