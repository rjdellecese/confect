import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import users from "./users.spec";

const create = FunctionImpl.make(
  databaseSchema,
  users,
  "create",
  ({ username }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("users").insert({ username });

      return null;
    }).pipe(Effect.orDie),
);

const clearAll = FunctionImpl.make(databaseSchema, users, "clearAll", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;

    const allUsers = yield* reader
      .table("users")
      .index("by_creation_time")
      .collect();

    yield* Effect.forEach(allUsers, (user) =>
      writer.table("users").delete(user._id),
    );

    return null;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, users).pipe(
  Layer.provide(create),
  Layer.provide(clearAll),
  GroupImpl.finalize,
);
