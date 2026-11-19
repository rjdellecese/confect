import * as Provider from "alchemy/Provider";
import { AuthoritativeEnvironmentVariable } from "./internal/Resources.js";
import { writer as provider } from "./internal/Environment.js";
export {
  AuthoritativeEnvironmentVariable,
  type AuthoritativeEnvironmentVariableProps,
  type AuthoritativeEnvironmentVariableAttributes,
} from "./internal/Resources.js";
export { provider };
export const layer = Provider.effect(
  AuthoritativeEnvironmentVariable,
  provider,
);
export { AuthoritativeEnvironmentVariableIdentityChange } from "./internal/DomainErrors.js";
