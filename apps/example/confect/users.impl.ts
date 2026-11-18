import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "./_generated/server";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import usersTable from "./_generated/tables/users";
import users from "./users.spec";

const create = FunctionImpl.make(users, "create", ({ username }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table(usersTable).insert({ username });

    return null;
  }).pipe(Effect.orDie),
);

const clearAll = FunctionImpl.make(users, "clearAll", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;

    const allUsers = yield* reader
      .table(usersTable)
      .index("by_creation_time")
      .collect();

    yield* Effect.forEach(
      allUsers,
      (user) => writer.table(usersTable).delete(user._id),
      { concurrency: 1 },
    );

    return null;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(users).pipe(
  Layer.provide(create),
  Layer.provide(clearAll),
  GroupImpl.finalize,
);
