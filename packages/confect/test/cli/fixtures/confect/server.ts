import {
  ConfectApiImpl,
  ConfectApiServer,
} from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import api from "./_generated/api";
import notes from "./impl/notes";

export default ConfectApiServer.make(api).pipe(
  Effect.provide(ConfectApiImpl.make(api).pipe(Layer.provide(notes))),
  Effect.runSync,
);
