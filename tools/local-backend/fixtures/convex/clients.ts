export { echoAction } from "../confect/clients.impl";
export { echoMutation } from "../confect/clients.impl";
export { echoQuery } from "../confect/clients.impl";
export { read } from "../confect/clients.impl";
export { write } from "../confect/clients.impl";

import type { InvalidConvexExports } from "@confect/core/FunctionSpec";
import type * as native from "../confect/clients.impl";
import type group from "../confect/clients.spec";

type Specs = (typeof group)["~Functions"];
type Assert<T extends never> = T;
declare type _Check = Assert<InvalidConvexExports<Specs, typeof native>>;
