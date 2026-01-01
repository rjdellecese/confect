import {
  ConfectApiFunctionImpl,
  ConfectApiGroupImpl,
} from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
// import {
//   ConfectDatabaseReader,
//   ConfectDatabaseWriter,
// } from "../../_generated/services";
import api from "../_generated/api";

const GetContent = ConfectApiFunctionImpl.make(
  api,
  "notes",
  "getContent",
  () =>
    // TODO
    Effect.gen(function* () {
      return yield* Effect.succeed("Hello, world!");
    }).pipe(Effect.orDie),
);

export default ConfectApiGroupImpl.make(api, "notes").pipe(
  Layer.provide(GetContent),
);
