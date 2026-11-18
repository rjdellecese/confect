export { echoAction } from "../confect/clients.native";
export { echoMutation } from "../confect/clients.native";
export { echoQuery } from "../confect/clients.native";
export { read } from "../confect/clients.native";
export { write } from "../confect/clients.native";

import type { InvalidConvexExports } from "@confect/core/FunctionSpec";
import type * as native from "../confect/clients.native";
import type group from "../confect/clients.spec";

type Specs = (typeof group)["~Functions"];
type Assert<T extends never> = T;
declare type _Check = Assert<InvalidConvexExports<Specs, typeof native>>;
