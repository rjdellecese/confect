import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import refs from "../_generated/refs";
import databaseSchema from "../_generated/schema";
import { DatabaseReader, QueryRunner } from "../_generated/services";
import ProvideViewer, { NoViewer, Viewer } from "./ProvideViewer.spec";

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

  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Generated runner constraints erase the ref's error; this ref declares no domain error, so its SchemaError is defected here.
  const username = yield* runQuery(
    refs.internal.groups.middlewareHelpers.firstUsername,
  ).pipe(Effect.orDie);

  if (username === null) {
    return yield* new NoViewer();
  }

  return { username };
});

export default MiddlewareImpl.makeByFunctionType(
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
