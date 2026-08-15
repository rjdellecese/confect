import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import databaseSchema from "../_generated/schema";
import { DatabaseReader } from "../_generated/services";
import RequireViewer, { NotSignedIn, Viewer } from "./RequireViewer.spec";

export default MiddlewareImpl.provides(
  databaseSchema,
  RequireViewer,
  Viewer,
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    const user = yield* reader
      .table("users")
      .index("by_creation_time", "desc")
      .first()
      .pipe(Effect.orDie);

    if (Option.isNone(user)) {
      return yield* new NotSignedIn();
    }

    return { user: user.value };
  }),
);
