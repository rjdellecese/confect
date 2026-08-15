import { FunctionImpl, GroupImpl, MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "../_generated/schema";
import refs from "../_generated/refs";
import { DatabaseReader, QueryRunner } from "../_generated/services";
import middleware, {
  NameTooShort,
  NoNotes,
  NoViewer,
  ProvideViewer,
  RequireLongName,
  Viewer,
} from "./middleware.spec";

const viewerFromDatabase = Effect.gen(function* () {
  const reader = yield* DatabaseReader;

  const user = yield* reader
    .table("users")
    .index("by_creation_time")
    .first()
    .pipe(Effect.orDie);

  if (Option.isNone(user)) {
    return yield* new NoViewer();
  }

  return { username: user.value.username };
});

const viewerViaRunQuery = Effect.gen(function* () {
  const runQuery = yield* QueryRunner;

  const username = yield* runQuery(
    refs.internal.groups.middlewareHelpers.firstUsername,
  ).pipe(Effect.catchTag("SchemaError", (error) => Effect.die(error)));

  if (username === null) {
    return yield* new NoViewer();
  }

  return { username };
});

const ProvideViewerLive = MiddlewareImpl.makeByKind(
  databaseSchema,
  ProvideViewer,
  {
    query: (effect) =>
      Effect.provideServiceEffect(effect, Viewer, viewerFromDatabase),
    mutation: (effect) =>
      Effect.provideServiceEffect(effect, Viewer, viewerFromDatabase),
    action: (effect) =>
      Effect.provideServiceEffect(effect, Viewer, viewerViaRunQuery),
  },
);

// Consumes the `Viewer` that `ProvideViewer` — earlier in the chain —
// provides, per this middleware's declared `requires`.
const RequireLongNameLive = MiddlewareImpl.make(
  databaseSchema,
  RequireLongName,
  (effect) =>
    Effect.gen(function* () {
      const { username } = yield* Viewer;

      if (username.length < 3) {
        return yield* new NameTooShort();
      }

      return yield* effect;
    }),
);

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
  Layer.provide(ProvideViewerLive),
  Layer.provide(RequireLongNameLive),
  GroupImpl.finalize,
);
