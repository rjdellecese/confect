import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import { Viewer } from "./ProvideViewer.spec";
import RequireLongName, { NameTooShort } from "./RequireLongName.spec";

// Consumes the `Viewer` that `ProvideViewer`—earlier in the chain—provides, per this middleware's declared `requires`.
export default MiddlewareImpl.make(RequireLongName, (effect) =>
  Effect.gen(function* () {
    const { username } = yield* Viewer;

    if (username.length < 3) {
      return yield* NameTooShort.make();
    }

    return yield* effect;
  }),
);
