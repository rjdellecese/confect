import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import type databaseSchema from "../_generated/schema";
import { Viewer } from "./ProvideViewer.spec";
import RequireName, { NameRejected } from "./RequireName.spec";

export default MiddlewareImpl.forSchema<typeof databaseSchema>().make(
  RequireName,
  (effect, { options }) =>
    Effect.gen(function* () {
      const { username } = yield* Viewer;
      if (username.length < options.minLength) {
        return yield* new NameRejected({ minLength: options.minLength });
      }
      return yield* effect;
    }),
);
