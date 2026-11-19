import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { MiddlewareImpl } from "../_generated/server";
import usersTable from "../_generated/tables/users";
import refs from "../_generated/refs";
import { DatabaseReader, QueryRunner } from "../_generated/services";
import ProvideViewer, { NoViewer, Viewer } from "./ProvideViewer.spec";

const viewerFromDatabase = Effect.gen(function* () {
  const reader = yield* DatabaseReader;

  const user = yield* reader
    .table(usersTable)
    .index("by_creation_time")
    .first()
    .pipe(Effect.orDie);

  if (Option.isNone(user)) {
    return yield* NoViewer.make();
  }

  return { username: user.value.username };
});

const viewerViaRunQuery = Effect.gen(function* () {
  const { runQuery } = yield* QueryRunner;

  const username = yield* runQuery(
    refs.internal.groups.middlewareHelpers.firstUsername,
  ).pipe(Effect.orDie);

  if (username === null) {
    return yield* NoViewer.make();
  }

  return { username };
});

export default MiddlewareImpl.makeByFunctionType(ProvideViewer, {
  query: (effect) =>
    Effect.provideServiceEffect(effect, Viewer, viewerFromDatabase),
  mutation: (effect) =>
    Effect.provideServiceEffect(effect, Viewer, viewerFromDatabase),
  action: (effect) =>
    Effect.provideServiceEffect(effect, Viewer, viewerViaRunQuery),
});
