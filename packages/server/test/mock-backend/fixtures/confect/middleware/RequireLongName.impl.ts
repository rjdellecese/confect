import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "../_generated/schema";
import { Viewer } from "./ProvideViewer.spec";
import RequireLongName, { NameTooShort } from "./RequireLongName.spec";

// Consumes the `Viewer` that `ProvideViewer` — earlier in the chain —
// provides, per this middleware's declared `requires`.
export default MiddlewareImpl.make(databaseSchema, RequireLongName, (effect) =>
  Effect.gen(function* () {
    const { username } = yield* Viewer;

    if (username.length < 3) {
      return yield* new NameTooShort();
    }

    return yield* effect;
  }),
);
