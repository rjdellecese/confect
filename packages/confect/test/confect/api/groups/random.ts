import { ConfectApiGroupImpl } from "@rjdellecese/confect";
import { Effect } from "effect";
import { Api } from "../../api";

export const Random = ConfectApiGroupImpl.make(
  Api,
  "groups.random",
  (handlers) =>
    handlers.handle("getNumber", () =>
      Effect.succeed(Math.random()).pipe(Effect.orDie),
    ),
);
