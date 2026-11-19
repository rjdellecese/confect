import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { MiddlewareImpl } from "../_generated/server";
import { DatabaseReader } from "../_generated/services";
import usersTable from "../_generated/tables/users";
import RequireViewer, { NotSignedIn, Viewer } from "./RequireViewer.spec";

export default MiddlewareImpl.provides(
  RequireViewer,
  Viewer,
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    const user = yield* reader
      .table(usersTable)
      .index("by_creation_time", "desc")
      .first()
      .pipe(Effect.orDie);

    return yield* Option.match(user, {
      onNone: () => NotSignedIn.make(),
      onSome: (user_) => Effect.succeed({ user: user_ }),
    });
  }),
);
