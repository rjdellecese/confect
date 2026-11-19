import * as Str from "effect/String";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import notesTable from "../_generated/tables/notes";
import { DatabaseReader } from "../_generated/services";
import ProvideViewer from "../middleware/ProvideViewer.impl";
import { Viewer } from "../middleware/ProvideViewer.spec";
import RequireLongName from "../middleware/RequireLongName.impl";
import middlewareSpec, { NoNotes } from "./middleware.spec";

const viewerUsername = Effect.gen(function* () {
  const viewer = yield* Viewer;

  return viewer.username;
});

const viewerName = FunctionImpl.make(
  middlewareSpec,
  "viewerName",
  () => viewerUsername,
);

const viewerNameMutation = FunctionImpl.make(
  middlewareSpec,
  "viewerNameMutation",
  () => viewerUsername,
);

const viewerNameAction = FunctionImpl.make(
  middlewareSpec,
  "viewerNameAction",
  () => viewerUsername,
);

const firstNoteForViewer = FunctionImpl.make(
  middlewareSpec,
  "firstNoteForViewer",
  () =>
    Effect.gen(function* () {
      const viewer = yield* Viewer;
      const reader = yield* DatabaseReader;

      const note = yield* reader
        .table(notesTable)
        .index("by_creation_time")
        .first()
        .pipe(Effect.orDie);

      if (Option.isNone(note)) {
        return yield* NoNotes.make();
      }

      return `${viewer.username}: ${note.value.text}`;
    }),
);

const shoutName = FunctionImpl.make(middlewareSpec, "shoutName", () =>
  Effect.gen(function* () {
    const { username } = yield* Viewer;

    return Str.toUpperCase(username);
  }),
);

export default GroupImpl.make(middlewareSpec).pipe(
  Layer.provide(viewerName),
  Layer.provide(viewerNameMutation),
  Layer.provide(viewerNameAction),
  Layer.provide(firstNoteForViewer),
  Layer.provide(shoutName),
  Layer.provide(ProvideViewer),
  Layer.provide(RequireLongName),
  GroupImpl.finalize,
);
