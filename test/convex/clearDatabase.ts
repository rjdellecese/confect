import { Effect, pipe } from "effect";

import { mutation } from "~/test/convex/_generated/server";
import schema from "~/test/convex/schema";

export default mutation({
  args: {},
  handler: async ({ db }): Promise<void> =>
    pipe(
      Object.keys(schema.tables) as (keyof typeof schema.tables)[],
      Effect.forEach((tableName) =>
        pipe(
          Effect.promise(() => db.query(tableName).collect()),
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              Effect.promise(() => db.delete(row._id))
            )
          )
        )
      ),
      Effect.asVoid,
      Effect.runPromise
    ),
});
