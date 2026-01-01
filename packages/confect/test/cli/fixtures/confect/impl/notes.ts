import { FunctionImpl, GroupImpl } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
// import {
//   DatabaseReader,
//   DatabaseWriter,
// } from "../../_generated/services";
import api from "../_generated/api";

const GetContent = FunctionImpl.make(api, "notes", "getContent", () =>
  // TODO
  Effect.gen(function* () {
    return yield* Effect.succeed("Hello, world!");
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(api, "notes").pipe(Layer.provide(GetContent));
