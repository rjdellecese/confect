import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { DatabaseWriter } from "./_generated/services";
import RequireViewer from "./middleware/RequireViewer.impl";
import { Viewer } from "./middleware/RequireViewer.spec";
import viewer from "./viewer.spec";

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
  Layer.provide(RequireViewer),
  GroupImpl.finalize,
);
