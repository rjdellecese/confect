import { ConfectApiBuilder, ConfectApiServer } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import Api from "./_generated/api";
import { Groups } from "./impl/groups";
import { Notes } from "./impl/groups/notes";
import { Random } from "./impl/groups/random";

export default ConfectApiServer.make.pipe(
  Effect.provide(
    ConfectApiBuilder.api(Api).pipe(
      Layer.provide(Groups.pipe(Layer.provide(Notes), Layer.provide(Random))),
    ),
  ),
  Effect.runSync,
);
