import * as Lazy from "@confect/core/Lazy";
import type { PropertyValidators, Validator } from "convex/values";

export const toConvexDefinition = <
  Args extends PropertyValidators,
  Returns extends Validator<any, any, any>,
  Handler,
>(prepared: {
  readonly args: () => Args;
  readonly returns: () => Returns;
  readonly handler: Handler;
}): { args: Args; returns: Returns; handler: Handler } => {
  const definition = { handler: prepared.handler };
  Lazy.defineProperty(definition, "args", prepared.args);
  Lazy.defineProperty(definition, "returns", prepared.returns);
  return definition as { args: Args; returns: Returns; handler: Handler };
};
