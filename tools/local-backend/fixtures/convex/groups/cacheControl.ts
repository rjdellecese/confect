export { control } from "../../confect/groups/cacheControl.impl";
export { snapshot } from "../../confect/groups/cacheControl.impl";

import type { InvalidConvexExports } from "@confect/core/FunctionSpec";
import type * as native from "../../confect/groups/cacheControl.impl";
import type group from "../../confect/groups/cacheControl.spec";

type Specs = (typeof group)["~Functions"];
type Assert<T extends never> = T;
declare type _Check = Assert<InvalidConvexExports<Specs, typeof native>>;
