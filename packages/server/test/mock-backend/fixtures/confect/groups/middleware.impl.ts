import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "../_generated/schema";
import { DatabaseReader } from "../_generated/services";
import ProvideViewer from "../middleware/ProvideViewer.impl";
import { Viewer } from "../middleware/ProvideViewer.spec";
import RequireLongName from "../middleware/RequireLongName.impl";
import middleware, { NoNotes } from "./middleware.spec";

const viewerUsername = Effect.gen(function* () {
  const viewer = yield* Viewer;

  return viewer.username;
});

const viewerName = FunctionImpl.make(
  databaseSchema,
  middleware,
  "viewerName",
  () => viewerUsername,
);

const viewerNameMutation = FunctionImpl.make(
  databaseSchema,
  middleware,
  "viewerNameMutation",
  () => viewerUsername,
);

const viewerNameAction = FunctionImpl.make(
  databaseSchema,
  middleware,
  "viewerNameAction",
  () => viewerUsername,
);

const firstNoteForViewer = FunctionImpl.make(
  databaseSchema,
  middleware,
  "firstNoteForViewer",
  () =>
    Effect.gen(function* () {
      const viewer = yield* Viewer;
      const reader = yield* DatabaseReader;

      const note = yield* reader
        .table("notes")
        .index("by_creation_time")
        .first()
        .pipe(Effect.orDie);

      if (Option.isNone(note)) {
        return yield* new NoNotes();
      }

      return `${viewer.username}: ${note.value.text}`;
    }),
);

const shoutName = FunctionImpl.make(
  databaseSchema,
  middleware,
  "shoutName",
  () =>
    Effect.gen(function* () {
      const { username } = yield* Viewer;

      return username.toUpperCase();
    }),
);

export default GroupImpl.make(databaseSchema, middleware).pipe(
  Layer.provide(viewerName),
  Layer.provide(viewerNameMutation),
  Layer.provide(viewerNameAction),
  Layer.provide(firstNoteForViewer),
  Layer.provide(shoutName),
  Layer.provide(ProvideViewer),
  Layer.provide(RequireLongName),
  GroupImpl.finalize,
);
