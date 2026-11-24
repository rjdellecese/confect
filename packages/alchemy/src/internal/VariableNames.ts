import * as Output from "alchemy/Output";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Record from "effect/Record";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import {
  ConflictingEnvironmentNames,
  ReservedEnvironmentVariableName,
  UnresolvedEnvironmentVariableNames,
} from "./DomainErrors.js";

type NameError = ConflictingEnvironmentNames | ReservedEnvironmentVariableName;
export const checkNames = (
  names: ReadonlyArray<string>,
): Result.Result<void, NameError> => {
  if (names.includes("Type") && names.includes("FQN"))
    return Result.fail(
      ConflictingEnvironmentNames.make({ names: ["Type", "FQN"] }),
    );
  for (const name of names) {
    if (["__proto__", "__redacted__", "__date__", "__bytes__"].includes(name))
      return Result.fail(
        ReservedEnvironmentVariableName.make({ variableName: name }),
      );
  }
  return Result.succeed(undefined);
};

export const declarationNames = (
  props: unknown,
): Result.Result<void, NameError | UnresolvedEnvironmentVariableNames> => {
  if (!Predicate.hasProperty(props, "variables"))
    return Result.fail(UnresolvedEnvironmentVariableNames.make({}));
  const vars = props.variables;
  if (
    !Predicate.isObject(vars) ||
    Array.isArray(vars) ||
    Effect.isEffect(vars) ||
    Output.isOutput(vars)
  )
    return Result.fail(UnresolvedEnvironmentVariableNames.make({}));
  return checkNames(Record.keys(vars));
};
