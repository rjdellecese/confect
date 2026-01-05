import { Impl, Server } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "./_generated/api";
import notes from "./impl/notes";

export default Server.make(api).pipe(
  Effect.provide(Impl.make(api).pipe(Layer.provide(notes))),
  Effect.runSync,
);
