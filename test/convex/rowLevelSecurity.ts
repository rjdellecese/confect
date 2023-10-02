import * as Schema from "@effect/schema/Schema";
import { PaginationResult } from "convex/server";
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

export const insertTwoUsersWithoutRulesConstraints = mutation(
  RowLevelSecurity<DataModel>({}).withMutationRLS(
    async ({ db }): Promise<void> =>
      pipe(
        db.insert("users", { name: "John Doe" }),
        Effect.flatMap(() => db.insert("users", { name: "Jane Doe" })),
        Effect.asUnit,
        Effect.runPromise
      )
  )
);

export const paginateUsersWithoutRuleConstraints = query(
  RowLevelSecurity<DataModel>({}).withQueryRLS(
    async ({ db }): Promise<PaginationResult<Doc<"users">>> =>
      pipe(
        db.query("users").paginate({ numItems: 10, cursor: null }),
        Effect.runPromise
      )
  )
);

export const paginateUsersWithRuleConstraints = query(
  RowLevelSecurity<DataModel>({
    users: {
      read: (ctx, user) =>
        Effect.if(user.name === "John Doe", {
          onTrue: Effect.succeed(false),
          onFalse: Effect.succeed(true),
        }),
    },
  }).withQueryRLS(
    async ({ db }): Promise<Doc<"users">[]> =>
      pipe(db.query("users").collect(), Effect.runPromise)
  )
);

export const collectUsersWithoutRuleConstraints = query(
  RowLevelSecurity<DataModel>({}).withQueryRLS(
    async ({ db }): Promise<Doc<"users">[]> =>
      pipe(db.query("users").collect(), Effect.runPromise)
  )
);

export const collectUsersWithRuleConstraints = query(
  RowLevelSecurity<DataModel>({
    users: {
      read: (ctx, user) =>
        Effect.if(user.name === "John Doe", {
          onTrue: Effect.succeed(false),
          onFalse: Effect.succeed(true),
        }),
    },
  }).withQueryRLS(
    async ({ db }): Promise<Doc<"users">[]> =>
      pipe(db.query("users").collect(), Effect.runPromise)
  )
);

export const takeUsersWithoutRuleConstraints = query(
  RowLevelSecurity<DataModel>({}).withQueryRLS(
    async ({ db }): Promise<Doc<"users">[]> =>
      pipe(db.query("users").take(2), Effect.runPromise)
  )
);

export const takeUsersWithRuleConstraints = query(
  RowLevelSecurity<DataModel>({
    users: {
      read: (ctx, user) =>
        Effect.if(user.name === "John Doe", {
          onTrue: Effect.succeed(false),
          onFalse: Effect.succeed(true),
        }),
    },
  }).withQueryRLS(
    async ({ db }): Promise<Doc<"users">[]> =>
      pipe(db.query("users").take(2), Effect.runPromise)
  )
);

export const firstUsersWithoutRuleConstraints = query(
  RowLevelSecurity<DataModel>({}).withQueryRLS(
    async ({ db }): Promise<Option.Option<Doc<"users">>> =>
      pipe(db.query("users").first(), Effect.runPromise)
  )
);

export const firstUsersWithRuleConstraints = query(
  RowLevelSecurity<DataModel>({
    users: {
      read: (ctx, user) =>
        Effect.if(user.name === "John Doe", {
          onTrue: Effect.succeed(false),
          onFalse: Effect.succeed(true),
        }),
    },
  }).withQueryRLS(
    async ({ db }): Promise<Option.Option<Doc<"users">>> =>
      pipe(
        db.query("users").first(),
        Schema.encodeOption(
          Schema.struct({
            _id: Schema.string,
            _creationTime: Schema.number,
            name: Schema.string,
          })
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
