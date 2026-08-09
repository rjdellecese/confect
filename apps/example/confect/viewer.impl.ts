import { FunctionImpl, GroupImpl, MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import viewer, { NotSignedIn, RequireViewer, Viewer } from "./viewer.spec";

const RequireViewerLive = MiddlewareImpl.provides(
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

const whoAmI = FunctionImpl.make(databaseSchema, viewer, "whoAmI", () =>
  Effect.gen(function* () {
    const { user } = yield* Viewer;

    return user.username;
  }),
);

const postNote = FunctionImpl.make(
  databaseSchema,
  viewer,
  "postNote",
  ({ text }) =>
    Effect.gen(function* () {
      const { user } = yield* Viewer;
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").insert({ text, userId: user._id });

      return null;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, viewer).pipe(
  Layer.provide(whoAmI),
  Layer.provide(postNote),
  Layer.provide(RequireViewerLive),
  GroupImpl.finalize,
);
