/// <reference types="vite/client" />

import { Ref } from "@confect/core";
import { RegisteredFunctions } from "@confect/server";
import {
  convexTest,
  type TestConvexForDataModel,
  type TestConvexForDataModelAndIdentity,
} from "convex-test";
import type {
  DataModelFromSchemaDefinition,
  UserIdentity,
} from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

import confectSchema from "./confect/schema";
import schema from "./convex/schema";

export type TestConfectWithoutIdentity = {
  query: <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    args: Ref.Args<QueryRef>["Type"],
  ) => Effect.Effect<Ref.Returns<QueryRef>["Type"], ParseResult.ParseError>;
  mutation: <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>["Type"],
  ) => Effect.Effect<Ref.Returns<MutationRef>["Type"], ParseResult.ParseError>;
  action: <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>["Type"],
  ) => Effect.Effect<Ref.Returns<ActionRef>["Type"], ParseResult.ParseError>;
  run: <A, E>(
    effect: Effect.Effect<
      A,
      E,
      RegisteredFunctions.MutationServices<typeof confectSchema>
    >,
  ) => Effect.Effect<A, E>;
  fetch: (
    pathQueryFragment: string,
    init?: RequestInit,
  ) => Effect.Effect<Response>;
  finishInProgressScheduledFunctions: () => Effect.Effect<void>;
  finishAllScheduledFunctions: (
    advanceTimers: () => void,
  ) => Effect.Effect<void>;
};

export type TestConfect = {
  withIdentity: (
    userIdentity: Partial<UserIdentity>,
  ) => TestConfectWithoutIdentity;
} & TestConfectWithoutIdentity;

export const TestConfect = Context.GenericTag<TestConfect>(
  "@rjdellecese/server/test/TestConfect",
);

class TestConfectImplWithoutIdentity implements TestConfectWithoutIdentity {
  constructor(
    private testConvex: TestConvexForDataModel<
      DataModelFromSchemaDefinition<typeof schema>
    >,
  ) {}

  readonly query = <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    args: Ref.Args<QueryRef>["Type"],
  ): Effect.Effect<Ref.Returns<QueryRef>["Type"], ParseResult.ParseError> =>
    Effect.gen(this, function* () {
      const query = Ref.getFunction(queryRef);
      const queryName = Ref.getConvexFunctionName(queryRef);

      const encodedArgs = yield* Schema.encode(query.args)(args);

      const encodedReturns = yield* Effect.promise(() =>
        this.testConvex.query(queryName as any, encodedArgs),
      );

      return yield* Schema.decode(query.returns)(encodedReturns);
    });

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>["Type"],
  ): Effect.Effect<Ref.Returns<MutationRef>["Type"], ParseResult.ParseError> =>
    Effect.gen(this, function* () {
      const mutation = Ref.getFunction(mutationRef);
      const mutationName = Ref.getConvexFunctionName(mutationRef);

      const encodedArgs = yield* Schema.encode(mutation.args)(args);

      const encodedReturns = yield* Effect.promise(() =>
        this.testConvex.mutation(mutationName as any, encodedArgs),
      );

      return yield* Schema.decode(mutation.returns)(encodedReturns);
    });

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>["Type"],
  ): Effect.Effect<Ref.Returns<ActionRef>["Type"], ParseResult.ParseError> =>
    Effect.gen(this, function* () {
      const action = Ref.getFunction(actionRef);
      const actionName = Ref.getConvexFunctionName(actionRef);

      const encodedArgs = yield* Schema.encode(action.args)(args);

      const encodedReturns = yield* Effect.promise(() =>
        this.testConvex.action(actionName as any, encodedArgs),
      );

      return yield* Schema.decode(action.returns)(encodedReturns);
    });

  readonly run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      RegisteredFunctions.MutationServices<typeof confectSchema>
    >,
  ) =>
    Effect.promise(() =>
      this.testConvex.run((mutationCtx) =>
        effect.pipe(
          Effect.provide(
            RegisteredFunctions.mutationLayer(confectSchema, mutationCtx),
          ),
          Effect.runPromise,
        ),
      ),
    );

  readonly fetch = <PathQueryFragment extends string>(
    pathQueryFragment: PathQueryFragment,
    init?: RequestInit,
  ) => Effect.promise(() => this.testConvex.fetch(pathQueryFragment, init));

  readonly finishInProgressScheduledFunctions = () =>
    Effect.promise(() => this.testConvex.finishInProgressScheduledFunctions());

  readonly finishAllScheduledFunctions = (advanceTimers: () => void) =>
    Effect.promise(() =>
      this.testConvex.finishAllScheduledFunctions(advanceTimers),
    );
}

class TestConfectImpl implements TestConfect {
  private readonly testConfectImplWithoutIdentity: TestConfectImplWithoutIdentity;

  constructor(
    private testConvex: TestConvexForDataModelAndIdentity<
      DataModelFromSchemaDefinition<typeof schema>
    >,
  ) {
    this.testConvex = testConvex;
    this.testConfectImplWithoutIdentity = new TestConfectImplWithoutIdentity(
      testConvex,
    );
  }

  readonly withIdentity = (userIdentity: Partial<UserIdentity>) =>
    new TestConfectImplWithoutIdentity(
      this.testConvex.withIdentity(userIdentity),
    );

  readonly query = <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    args: Ref.Args<QueryRef>["Type"],
  ) => this.testConfectImplWithoutIdentity.query(queryRef, args);

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>["Type"],
  ) => this.testConfectImplWithoutIdentity.mutation(mutationRef, args);

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>["Type"],
  ) => this.testConfectImplWithoutIdentity.action(actionRef, args);

  readonly run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      RegisteredFunctions.MutationServices<typeof confectSchema>
    >,
  ) => this.testConfectImplWithoutIdentity.run(effect);

  readonly fetch = <PathQueryFragment extends string>(
    pathQueryFragment: PathQueryFragment,
    init?: RequestInit,
  ) => this.testConfectImplWithoutIdentity.fetch(pathQueryFragment, init);

  readonly finishInProgressScheduledFunctions = () =>
    this.testConfectImplWithoutIdentity.finishInProgressScheduledFunctions();

  readonly finishAllScheduledFunctions = (advanceTimers: () => void) =>
    this.testConfectImplWithoutIdentity.finishAllScheduledFunctions(
      advanceTimers,
    );
}

// In theory it might be possible to also have a version of this which runs the tests on the local or cloud backends
export const layer = Effect.sync(
  () =>
    new TestConfectImpl(
      convexTest(schema, import.meta.glob("./convex/**/!(*.*.*)*.*s")),
    ),
).pipe(Layer.effect(TestConfect));
