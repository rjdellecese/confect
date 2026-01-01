import {
  ConfectApiFunctionImpl,
  ConfectApiGroupImpl,
} from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import { Api } from "../../api";

const GetNumber = ConfectApiFunctionImpl.make(
  Api,
  "groups.random",
  "getNumber",
  () => Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export const Random = ConfectApiGroupImpl.make(Api, "groups.random").pipe(
  Layer.provide(GetNumber),
);
