/// <reference types="vite/client" />

import type {
  DataModelFromSchemaDefinition,
  FunctionReference,
  FunctionReturnType,
  GenericMutationCtx,
  OptionalRestArgs,
  StorageActionWriter,
  UserIdentity,
} from "convex/server";
import {
  convexTest,
  type TestConvexForDataModel,
  type TestConvexForDataModelAndIdentity,
} from "convex-test";
import { Context, Effect, Layer, pipe } from "effect";

import schema from "./convex/schema";

export type TestConvexServiceWithoutIdentity = {
  query: <Query extends FunctionReference<"query", any>>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.Effect<FunctionReturnType<Query>>;
  mutation: <Mutation extends FunctionReference<"mutation", any>>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Effect.Effect<FunctionReturnType<Mutation>>;
  action: <Action extends FunctionReference<"action", any>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.Effect<FunctionReturnType<Action>>;
  run: <Output>(
    func: (
      ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>> & {
        storage: StorageActionWriter;
      },
    ) => Promise<Output>,
  ) => Effect.Effect<Output>;
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
  "@rjdellecese/confect/TestConvexService",
);

class TestConvexServiceImplWithoutIdentity
  implements TestConvexServiceWithoutIdentity
{
  constructor(
    private testConvex: TestConvexForDataModel<
      DataModelFromSchemaDefinition<typeof schema>
    >,
  ) {}

  readonly query = <Query extends FunctionReference<"query", any>>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.promise(() => this.testConvex.query(query, ...args));

  readonly mutation = <Mutation extends FunctionReference<"mutation", any>>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Effect.promise(() => this.testConvex.mutation(mutation, ...args));

  readonly action = <Action extends FunctionReference<"action", any>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.promise(() => this.testConvex.action(action, ...args));

  readonly run = <Output>(
    func: (
      ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>> & {
        storage: StorageActionWriter;
      },
    ) => Promise<Output>,
  ) => Effect.promise(() => this.testConvex.run(func));

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
  constructor(
    private testConvex: TestConvexForDataModelAndIdentity<
      DataModelFromSchemaDefinition<typeof schema>
    >,
  ) {
    this.testConvex = testConvex;
  }

  readonly withIdentity = (userIdentity: Partial<UserIdentity>) =>
    new TestConvexServiceImplWithoutIdentity(
      this.testConvex.withIdentity(userIdentity),
    );

  readonly query = <Query extends FunctionReference<"query", any>>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.promise(() => this.testConvex.query(query, ...args));

  readonly mutation = <Mutation extends FunctionReference<"mutation", any>>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Effect.promise(() => this.testConvex.mutation(mutation, ...args));

  readonly action = <Action extends FunctionReference<"action", any>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.promise(() => this.testConvex.action(action, ...args));

  readonly run = <Output>(
    func: (
      ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>> & {
        storage: StorageActionWriter;
      },
    ) => Promise<Output>,
  ) => Effect.promise(() => this.testConvex.run(func));

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

// In theory it might be possible to also have a version of this which runs the tests on the local or cloud backends
export const layer = Effect.sync(() =>
  pipe(
    convexTest(schema, import.meta.glob("./**/!(*.*.*)*.*s")),
    (testConvex): TestConvexService => new TestConvexServiceImpl(testConvex),
  ),
).pipe(Layer.effect(TestConvexService));
