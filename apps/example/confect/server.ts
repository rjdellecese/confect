import {
  ConfectApiBuilder,
  ConfectApiServer,
} from "@rjdellecese/confect/server";
import { Effect, Layer } from "effect";
import { Api } from "./api";
import { Groups } from "./api/groups";
import { Notes } from "./api/groups/notes";
import { Random } from "./api/groups/random";

export default ConfectApiServer.make.pipe(
  Effect.provide(
    ConfectApiBuilder.api(Api).pipe(
      Layer.provide(Groups.pipe(Layer.provide(Notes), Layer.provide(Random))),
    ),
  ),
  Effect.runSync,
);
