import { ConfectApiBuilder } from "@rjdellecese/confect";
import { Effect } from "effect";
// import {
//   ConfectDatabaseReader,
//   ConfectDatabaseWriter,
// } from "../../_generated/services";
import api from "../_generated/api";

export default ConfectApiBuilder.group(api, "notes", (handlers) =>
  handlers.handle("getContent", () =>
    // TODO
    Effect.gen(function* () {
      return yield* Effect.succeed("Hello, world!");
    }).pipe(Effect.orDie),
  ),
);
