import * as Data from "effect/Data";
import * as Match from "effect/Match";
import type * as CompilationInputs from "./CompilationInputs";
import type { Mode } from "./CompilationState";

export type Policy = Data.TaggedEnum<{
  Watch: {};
  OnceConcurrent: {};
  OnceStable: {};
}>;
export const Policy = Data.taggedEnum<Policy>();

export const concurrent = (mode: Mode): Policy =>
  Match.value(mode).pipe(
    Match.when("Watch", () => Policy.Watch()),
    Match.when("Once", () => Policy.OnceConcurrent()),
    Match.exhaustive,
  );

export const forCompilation = (mode: Mode): Policy =>
  Match.value(mode).pipe(
    Match.when("Watch", () => Policy.Watch()),
    Match.when("Once", () => Policy.OnceStable()),
    Match.exhaustive,
  );

export const toMode = (policy: Policy): Mode =>
  Policy.$match(policy, {
    Watch: () => "Watch" as const,
    OnceConcurrent: () => "Once" as const,
    OnceStable: () => "Once" as const,
  });

export const guards = (policy: Policy, inputs: CompilationInputs.Inputs) =>
  Policy.$match(policy, {
    Watch: () => inputs,
    OnceConcurrent: () => inputs,
    OnceStable: () => ({
      check: inputs.check,
      ensure: inputs.ensure,
      trackSource: inputs.trackSource,
    }),
  });
