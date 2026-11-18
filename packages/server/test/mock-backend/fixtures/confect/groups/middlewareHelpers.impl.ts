import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { FunctionImpl } from "../_generated/server";
import usersTable from "../_generated/tables/users";
import { DatabaseReader } from "../_generated/services";
import middlewareHelpers from "./middlewareHelpers.spec";

const firstUsername = FunctionImpl.make(
  middlewareHelpers,
  "firstUsername",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      const user = yield* reader
        .table(usersTable)
        .index("by_creation_time")
        .first();

      return Option.match(user, {
        onNone: () => null,
        onSome: (user_) => user_.username,
      });
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(middlewareHelpers).pipe(
  Layer.provide(firstUsername),
  GroupImpl.finalize,
);
