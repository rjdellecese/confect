import { Ref } from "@confect/core";
import type { DatabaseSchema, DataModel } from "@confect/server";
import { RegisteredFunctions } from "@confect/server";
import type {
  TestConvexForDataModel,
  TestConvexForDataModelAndIdentity,
} from "convex-test";
import type { UserIdentity } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

export type TestConfectWithoutIdentity<
  ConfectSchema extends DatabaseSchema.AnyWithProps,
> = {
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
      RegisteredFunctions.MutationServices<ConfectSchema>
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

export type TestConfect<ConfectSchema extends DatabaseSchema.AnyWithProps> = {
  withIdentity: (
    userIdentity: Partial<UserIdentity>,
  ) => TestConfectWithoutIdentity<ConfectSchema>;
} & TestConfectWithoutIdentity<ConfectSchema>;

export const TestConfect = <
  ConfectSchema extends DatabaseSchema.AnyWithProps,
>() =>
  Context.GenericTag<TestConfect<ConfectSchema>>("@confect/test/TestConfect");

class TestConfectImplWithoutIdentity<
  ConfectSchema extends DatabaseSchema.AnyWithProps,
> implements TestConfectWithoutIdentity<ConfectSchema>
{
  constructor(
    private confectSchema: ConfectSchema,
    private testConvex: TestConvexForDataModel<
      DataModel.ToConvex<DataModel.FromSchema<ConfectSchema>>
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
      RegisteredFunctions.MutationServices<ConfectSchema>
    >,
  ): Effect.Effect<A, E> =>
    Effect.async<A, E>((resume) => {
      void this.testConvex.run(async (mutationCtx) => {
        resume(
          effect.pipe(
            Effect.provide(
              RegisteredFunctions.mutationLayer(
                this.confectSchema,
                mutationCtx,
              ),
            ),
          ),
        );
      });
    });

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

class TestConfectImpl<ConfectSchema extends DatabaseSchema.AnyWithProps>
  implements TestConfect<ConfectSchema>
{
  private readonly testConfectImplWithoutIdentity: TestConfectImplWithoutIdentity<ConfectSchema>;

  constructor(
    private confectSchema: ConfectSchema,
    private testConvex: TestConvexForDataModelAndIdentity<
      DataModel.ToConvex<DataModel.FromSchema<ConfectSchema>>
    >,
  ) {
    this.testConvex = testConvex;
    this.testConfectImplWithoutIdentity = new TestConfectImplWithoutIdentity(
      confectSchema,
      testConvex,
    );
  }

  readonly withIdentity = (userIdentity: Partial<UserIdentity>) =>
    new TestConfectImplWithoutIdentity(
      this.confectSchema,
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
      RegisteredFunctions.MutationServices<ConfectSchema>
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

export const layer = <ConfectSchema extends DatabaseSchema.AnyWithProps>(
  confectSchema: ConfectSchema,
  testConvex: TestConvexForDataModelAndIdentity<
    DataModel.ToConvex<DataModel.FromSchema<ConfectSchema>>
  >,
): Layer.Layer<TestConfect<ConfectSchema>> =>
  Effect.sync(() => new TestConfectImpl(confectSchema, testConvex)).pipe(
    Layer.effect(TestConfect<ConfectSchema>()),
  );
