import * as Schema from "effect/Schema";
import * as Match from "effect/Match";
import type * as CompilationInputs from "./CompilationInputs";
import type * as CompilationState from "./CompilationState";
import type * as CompilationContext from "./CompilationContext";

export const CompilationPolicy = Schema.Literals([
  "Watch",
  "OnceConcurrent",
  "OnceStable",
]);
export type CompilationPolicy = typeof CompilationPolicy.Type;

export const concurrent = (mode: CompilationState.Mode): CompilationPolicy =>
  Match.value(mode).pipe(
    Match.when("Watch", () => "Watch" as const),
    Match.when("Once", () => "OnceConcurrent" as const),
    Match.exhaustive,
  );

export const forCompilation = (
  mode: CompilationState.Mode,
): CompilationPolicy =>
  Match.value(mode).pipe(
    Match.when("Watch", () => "Watch" as const),
    Match.when("Once", () => "OnceStable" as const),
    Match.exhaustive,
  );

export const toMode = (policy: CompilationPolicy): CompilationState.Mode =>
  Match.value(policy).pipe(
    Match.when("Watch", () => "Watch" as const),
    Match.whenOr("OnceConcurrent", "OnceStable", () => "Once" as const),
    Match.exhaustive,
  );

export const guards = (
  policy: CompilationPolicy,
  inputs: CompilationInputs.Inputs,
): CompilationContext.Guards =>
  Match.value(policy).pipe(
    Match.whenOr("Watch", "OnceConcurrent", () => inputs),
    Match.when("OnceStable", () => ({
      check: inputs.check,
      ensure: inputs.ensure,
      trackSource: inputs.trackSource,
    })),
    Match.exhaustive,
  );
