import * as Provider from "alchemy/Provider";
import { Project } from "./internal/Resources.js";
import { projects as provider } from "./internal/Infrastructure.js";
export {
  Project,
  type ProjectProps,
  type ProjectAttributes,
} from "./internal/Resources.js";
export { provider };
export const layer = Provider.effect(Project, provider);
export {
  ProjectTeamChange,
  AmbiguousProject,
} from "./internal/DomainErrors.js";
