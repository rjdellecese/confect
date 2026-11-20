import * as Provider from "alchemy/Provider";
import { Code } from "./internal/Resources.js";
import { pushes as provider } from "./internal/Push.js";
export {
  Code,
  type CodeProps,
  type CodeAttributes,
  type PrepareCommand,
} from "./internal/Resources.js";
export { provider };
export const layer = Provider.effect(Code, provider);
