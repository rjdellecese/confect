import * as Provider from "alchemy/Provider";
import { Deployment } from "./internal/Resources.js";
import { deployments as provider } from "./internal/Infrastructure.js";
export {
  Deployment,
  type DeploymentProps,
  type DeploymentAttributes,
} from "./internal/Resources.js";
export { provider };
export const layer = Provider.effect(Deployment, provider);
export {
  DeploymentIdentityChange,
  UnsupportedLocalDeployment,
  AmbiguousDeployment,
} from "./internal/DomainErrors.js";
