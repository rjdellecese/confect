import { Spec } from "@confect/core";
import typedErrorsNode from "../node/typedErrorsNode.spec";

export default Spec.makeNode().addPath(typedErrorsNode, "typedErrorsNode").addAt("typedErrorsNode", typedErrorsNode);
