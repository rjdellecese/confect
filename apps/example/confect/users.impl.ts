import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import users from "./_generated/tables/users";
import usersSpec from "./users.spec";

const create = FunctionImpl.make(usersSpec, "create", ({ username }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table(users).insert({ username });

    return null;
  }).pipe(Effect.orDie),
);

const clearAll = FunctionImpl.make(usersSpec, "clearAll", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;

    const allUsers = yield* reader
      .table(users)
      .index("by_creation_time")
      .collect();

    yield* Effect.forEach(
      allUsers,
      (user) => writer.table(users).delete(user._id),
      { concurrency: 1 },
    );

    return null;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(usersSpec).pipe(
  Layer.provide(create),
  Layer.provide(clearAll),
  GroupImpl.finalize,
);
