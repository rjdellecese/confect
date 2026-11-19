import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { DatabaseWriter } from "./_generated/services";
import notesTable from "./_generated/tables/notes";
import RequireViewer from "./middleware/RequireViewer.impl";
import { Viewer } from "./middleware/RequireViewer.spec";
import viewerSpec from "./viewer.spec";

const whoAmI = FunctionImpl.make(viewerSpec, "whoAmI", () =>
  Effect.gen(function* () {
    const { user } = yield* Viewer;

    return user.username;
  }),
);

const postNote = FunctionImpl.make(viewerSpec, "postNote", ({ text }) =>
  Effect.gen(function* () {
    const { user } = yield* Viewer;
    const writer = yield* DatabaseWriter;

    yield* writer.table(notesTable).insert({ text, userId: user._id });

    return null;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(viewerSpec).pipe(
  Layer.provide(whoAmI),
  Layer.provide(postNote),
  Layer.provide(RequireViewer),
  GroupImpl.finalize,
);
