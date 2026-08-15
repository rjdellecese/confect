import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "../_generated/schema";
import { DatabaseReader } from "../_generated/services";
import middlewareHelpers from "./middlewareHelpers.spec";

const firstUsername = FunctionImpl.make(
  databaseSchema,
  middlewareHelpers,
  "firstUsername",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      const user = yield* reader
        .table("users")
        .index("by_creation_time")
        .first();

      return Option.match(user, {
        onNone: () => null,
        onSome: (user_) => user_.username,
      });
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, middlewareHelpers).pipe(
  Layer.provide(firstUsername),
  GroupImpl.finalize,
);
