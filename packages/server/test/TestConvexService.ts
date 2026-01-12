/// <reference types="vite/client" />

import { Ref } from "@confect/core";
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
import type {
  Auth,
  DatabaseReader,
  DatabaseWriter,
  MutationCtx,
  MutationRunner,
  QueryRunner,
  Scheduler,
  Storage,
} from "../src/index";
import { Server } from "../src/index";

import confectSchema from "./confect/schema";
import schema from "./convex/schema";

export type TestConvexServiceWithoutIdentity = {
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
      | DatabaseReader.DatabaseReader<typeof confectSchema>
      | DatabaseWriter.DatabaseWriter<typeof confectSchema>
      | Auth.Auth
      | Scheduler.Scheduler
      | Storage.StorageReader
      | Storage.StorageWriter
      | QueryRunner.QueryRunner
      | MutationRunner.MutationRunner
      | MutationCtx.MutationCtx<DataModelFromSchemaDefinition<typeof schema>>
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

export type TestConvexService = {
  withIdentity: (
    userIdentity: Partial<UserIdentity>,
  ) => TestConvexServiceWithoutIdentity;
} & TestConvexServiceWithoutIdentity;

export const TestConvexService = Context.GenericTag<TestConvexService>(
  "@rjdellecese/confect/test/TestConvexService",
);

class TestConvexServiceImplWithoutIdentity
  implements TestConvexServiceWithoutIdentity
{
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
      | DatabaseReader.DatabaseReader<typeof confectSchema>
      | DatabaseWriter.DatabaseWriter<typeof confectSchema>
      | Auth.Auth
      | Scheduler.Scheduler
      | Storage.StorageReader
      | Storage.StorageWriter
      | QueryRunner.QueryRunner
      | MutationRunner.MutationRunner
      | MutationCtx.MutationCtx<DataModelFromSchemaDefinition<typeof schema>>
    >,
  ) =>
    Effect.promise(() =>
      this.testConvex.run((mutationCtx) =>
        effect.pipe(
          Effect.provide(Server.mutationLayer(confectSchema, mutationCtx)),
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

class TestConvexServiceImpl implements TestConvexService {
  private readonly testConvexServiceImplWithoutIdentity: TestConvexServiceImplWithoutIdentity;

  constructor(
    private testConvex: TestConvexForDataModelAndIdentity<
      DataModelFromSchemaDefinition<typeof schema>
    >,
  ) {
    this.testConvex = testConvex;
    this.testConvexServiceImplWithoutIdentity =
      new TestConvexServiceImplWithoutIdentity(testConvex);
  }

  readonly withIdentity = (userIdentity: Partial<UserIdentity>) =>
    new TestConvexServiceImplWithoutIdentity(
      this.testConvex.withIdentity(userIdentity),
    );

  readonly query = <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    args: Ref.Args<QueryRef>["Type"],
  ) => this.testConvexServiceImplWithoutIdentity.query(queryRef, args);

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>["Type"],
  ) => this.testConvexServiceImplWithoutIdentity.mutation(mutationRef, args);

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>["Type"],
  ) => this.testConvexServiceImplWithoutIdentity.action(actionRef, args);

  readonly run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | DatabaseReader.DatabaseReader<typeof confectSchema>
      | DatabaseWriter.DatabaseWriter<typeof confectSchema>
      | Auth.Auth
      | Scheduler.Scheduler
      | Storage.StorageReader
      | Storage.StorageWriter
      | QueryRunner.QueryRunner
      | MutationRunner.MutationRunner
      | MutationCtx.MutationCtx<DataModelFromSchemaDefinition<typeof schema>>
    >,
  ) => this.testConvexServiceImplWithoutIdentity.run(effect);

  readonly fetch = <PathQueryFragment extends string>(
    pathQueryFragment: PathQueryFragment,
    init?: RequestInit,
  ) => this.testConvexServiceImplWithoutIdentity.fetch(pathQueryFragment, init);

  readonly finishInProgressScheduledFunctions = () =>
    this.testConvexServiceImplWithoutIdentity.finishInProgressScheduledFunctions();

  readonly finishAllScheduledFunctions = (advanceTimers: () => void) =>
    this.testConvexServiceImplWithoutIdentity.finishAllScheduledFunctions(
      advanceTimers,
    );
}

// In theory it might be possible to also have a version of this which runs the tests on the local or cloud backends
export const layer = Effect.sync(
  () =>
    new TestConvexServiceImpl(
      convexTest(schema, import.meta.glob("./convex/**/!(*.*.*)*.*s")),
    ),
).pipe(Layer.effect(TestConvexService));
