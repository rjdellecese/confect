import { RegisteredNodeFunction } from "@confect/server/node";
import groupLayer from "../../typedErrorsNode.impl";

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default RegisteredNodeFunction.buildForGroup<typeof import("../../typedErrorsNode.spec")["default"]>(groupLayer);
