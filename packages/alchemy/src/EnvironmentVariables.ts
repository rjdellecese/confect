import * as Provider from "alchemy/Provider";
import { EnvironmentVariables } from "./internal/Resources.js";
import { environment as provider } from "./internal/Environment.js";
export {
  EnvironmentVariables,
  type EnvironmentVariablesProps,
  type EnvironmentVariablesAttributes,
} from "./internal/Resources.js";
export { provider };
export const layer = Provider.effect(EnvironmentVariables, provider);
export {
  ConflictingEnvironmentNames,
  ReservedEnvironmentVariableName,
  UnreadableEnvironmentVariable,
  UnresolvedEnvironmentVariableNames,
  EnvironmentTargetChange,
} from "./internal/DomainErrors.js";
