import * as Provider from "alchemy/Provider";
import { DeployKey } from "./internal/Resources.js";
import { deployKeys as provider } from "./internal/Infrastructure.js";
export {
  DeployKey,
  type DeployKeyProps,
  type DeployKeyAttributes,
} from "./internal/Resources.js";
export { provider };
export const layer = Provider.effect(DeployKey, provider);
export {
  DeployKeyRecoveryRequired,
  DeployKeyChangeRequiresNewResource,
} from "./internal/DomainErrors.js";
