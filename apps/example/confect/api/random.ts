import { ConfectApiBuilder } from "@rjdellecese/confect/api";
import { Effect } from "effect";
import api from "../api";

export default ConfectApiBuilder.group(api, "random", (handlers) =>
  handlers.handle("getNumber", () =>
    Effect.succeed(Math.random()).pipe(Effect.orDie),
  ),
);
