export { backgroundWork } from "../confect/workpool.native";
export { enqueue } from "../confect/workpool.native";
export { onComplete } from "../confect/workpool.native";
export { status } from "../confect/workpool.native";

import type { InvalidConvexExports } from "@confect/core/FunctionSpec";
import type * as native from "../confect/workpool.native";
import type group from "../confect/workpool.spec";

type Specs = (typeof group)["~Functions"];
type Assert<T extends never> = T;
declare type _Check = Assert<InvalidConvexExports<Specs, typeof native>>;
