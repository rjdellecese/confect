import { Effect, Option, pipe } from "effect";

import { RowLevelSecurity } from "../../src/row-level-security";
import { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

export const getUserWithoutRulesConstraints = query(
  RowLevelSecurity<DataModel>({}).withQueryRLS(
    async (
      { db },
      { userId }: { userId: Id<"users"> }
    ): Promise<Id<"users"> | null> =>
      pipe(
        db.get(userId),
        Effect.map((optionUser) =>
          pipe(
            optionUser,
            Option.map(({ _id }) => _id),
            Option.getOrNull
          )
        ),
        Effect.runPromise
      )
  )
);

export const insertUserWithoutRulesConstraints = mutation(
  RowLevelSecurity<DataModel>({}).withMutationRLS(
    async ({ db }): Promise<Id<"users">> =>
      Effect.runPromise(db.insert("users", { name: "John Doe" }))
  )
);

export const insertUserWithRulesConstraints = mutation(
  RowLevelSecurity<DataModel>({
    users: {
      insert: () => Effect.succeed(false),
    },
  }).withMutationRLS(
    async ({ db }): Promise<Id<"users">> =>
      Effect.runPromise(db.insert("users", { name: "John Doe" }))
  )
);

export const patchWithoutRulesConstraintsSucceeds = mutation(
  RowLevelSecurity<DataModel>({}).withMutationRLS(
    async ({ db }): Promise<Option.Option<Doc<"users">>> =>
      pipe(
        Effect.Do,
        Effect.bind("userId", () => db.insert("users", { name: "John Doe" })),
        Effect.tap(({ userId }: { userId: Id<"users"> }) =>
          db.patch(userId, { name: "Jane Doe" })
        ),
        Effect.flatMap(({ userId }) => db.get(userId)),
        Effect.runPromise
      )
  )
);

export const disallowedPatchThrowsAnError = mutation(
  RowLevelSecurity<DataModel>({
    users: {
      modify: () => Effect.succeed(false),
    },
  }).withMutationRLS(
    async ({ db }): Promise<void> =>
      pipe(
        db.insert("users", { name: "John Doe" }),
        Effect.flatMap((userId) => db.patch(userId, { name: "Jane Doe" })),
        Effect.runPromise
      )
  )
);
