export { backgroundWork } from "../confect/workpool.impl";
export { enqueue } from "../confect/workpool.impl";
export { onComplete } from "../confect/workpool.impl";
export { status } from "../confect/workpool.impl";

import type { InvalidConvexExports } from "@confect/core/FunctionSpec";
import type * as native from "../confect/workpool.impl";
import type group from "../confect/workpool.spec";

type Specs = (typeof group)["~Functions"];
type Assert<T extends never> = T;
declare type _Check = Assert<InvalidConvexExports<Specs, typeof native>>;
