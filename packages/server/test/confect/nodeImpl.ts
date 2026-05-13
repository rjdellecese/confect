import { Impl } from "@confect/server";
import { Layer } from "effect";
import nodeApi from "./_generated/nodeApi";
import { typedErrorsNode } from "./node/typedErrorsNode.impl";

export default Impl.make(nodeApi).pipe(
  Layer.provide(typedErrorsNode),
  Impl.finalize,
);
