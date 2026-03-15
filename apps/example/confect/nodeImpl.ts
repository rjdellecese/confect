import { Impl } from "@confect/server";
import { Layer } from "effect";
import nodeApi from "./_generated/nodeApi";
import { email } from "./node/email.impl";

export default Impl.make(nodeApi).pipe(Layer.provide(email), Impl.finalize);
