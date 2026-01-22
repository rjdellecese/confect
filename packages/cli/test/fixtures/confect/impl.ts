import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import notes from "./impl/notes";

export default Impl.make(api).pipe(Layer.provide(notes), Impl.finalize);
