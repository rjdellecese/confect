import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { groups } from "./groups.impl";

export default Impl.make(api).pipe(Layer.provide(groups), Impl.finalize);
