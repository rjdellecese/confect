import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import { Viewer } from "./ProvideViewer.spec";
import RequireName, { NameRejected } from "./RequireName.spec";

export default MiddlewareImpl.make(RequireName, (effect, { options }) =>
  Effect.gen(function* () {
    const { username } = yield* Viewer;
    if (username.length < options.minLength) {
      return yield* NameRejected.make({ minLength: options.minLength });
    }
    return yield* effect;
  }),
);
