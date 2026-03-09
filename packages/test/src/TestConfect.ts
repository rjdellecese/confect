import { Ref } from "@confect/core";
import type { DatabaseSchema, DataModel } from "@confect/server";
import { RegisteredConvexFunction } from "@confect/server";
import type {
  TestConvexForDataModel,
  TestConvexForDataModelAndIdentity,
} from "convex-test";
import { convexTest } from "convex-test";
import type { GenericMutationCtx, UserIdentity } from "convex/server";
import type { Value } from "convex/values";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Match, Schema } from "effect";

export type TestConfectWithoutIdentity<
  ConfectSchema extends DatabaseSchema.AnyWithProps,
> = {
  query: <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    args: Ref.Args<QueryRef>,
  ) => Effect.Effect<Ref.Returns<QueryRef>, ParseResult.ParseError>;
  mutation: <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>,
  ) => Effect.Effect<Ref.Returns<MutationRef>, ParseResult.ParseError>;
  action: <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>,
  ) => Effect.Effect<Ref.Returns<ActionRef>, ParseResult.ParseError>;
  run: {
    <E>(
      handler: Effect.Effect<
        void,
        E,
        RegisteredConvexFunction.MutationServices<ConfectSchema>
      >,
    ): Effect.Effect<void>;
    <A, B extends Value, E>(
      handler: Effect.Effect<
        A,
        E,
        RegisteredConvexFunction.MutationServices<ConfectSchema>
      >,
      returns: Schema.Schema<A, B>,
    ): Effect.Effect<A, ParseResult.ParseError>;
  };
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
> implements TestConfectWithoutIdentity<ConfectSchema> {
  constructor(
    private confectSchema: ConfectSchema,
    private testConvex: TestConvexForDataModel<
      DataModel.ToConvex<DataModel.FromSchema<ConfectSchema>>
    >,
  ) {}

  readonly query = <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    args: Ref.Args<QueryRef>,
  ): Effect.Effect<Ref.Returns<QueryRef>, ParseResult.ParseError> =>
    Effect.gen(this, function* () {
      const querySpec = Ref.getFunctionSpec(queryRef);
      const queryName = Ref.getConvexFunctionName(queryRef);

      return yield* Match.value(querySpec.functionProvenance).pipe(
        Match.tag("Confect", (confect) =>
          Effect.gen(this, function* () {
            const encodedArgs = yield* Schema.encode(confect.args)(args);
            const encodedReturns = yield* Effect.promise(() =>
              this.testConvex.query(queryName as any, encodedArgs),
            );
            return yield* Schema.decode(confect.returns)(encodedReturns);
          }),
        ),
        Match.tag("Convex", () =>
          Effect.promise(() =>
            this.testConvex.query(queryName as any, args as any),
          ),
        ),
        Match.exhaustive,
      );
    });

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>,
  ): Effect.Effect<Ref.Returns<MutationRef>, ParseResult.ParseError> =>
    Effect.gen(this, function* () {
      const mutationSpec = Ref.getFunctionSpec(mutationRef);
      const mutationName = Ref.getConvexFunctionName(mutationRef);

      return yield* Match.value(mutationSpec.functionProvenance).pipe(
        Match.tag("Confect", (confect) =>
          Effect.gen(this, function* () {
            const encodedArgs = yield* Schema.encode(confect.args)(args);
            const encodedReturns = yield* Effect.promise(() =>
              this.testConvex.mutation(mutationName as any, encodedArgs),
            );
            return yield* Schema.decode(confect.returns)(encodedReturns);
          }),
        ),
        Match.tag("Convex", () =>
          Effect.promise(() =>
            this.testConvex.mutation(mutationName as any, args as any),
          ),
        ),
        Match.exhaustive,
      );
    });

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>,
  ): Effect.Effect<Ref.Returns<ActionRef>, ParseResult.ParseError> =>
    Effect.gen(this, function* () {
      const actionSpec = Ref.getFunctionSpec(actionRef);
      const actionName = Ref.getConvexFunctionName(actionRef);

      return yield* Match.value(actionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confect) =>
          Effect.gen(this, function* () {
            const encodedArgs = yield* Schema.encode(confect.args)(args);
            const encodedReturns = yield* Effect.promise(() =>
              this.testConvex.action(actionName as any, encodedArgs),
            );
            return yield* Schema.decode(confect.returns)(encodedReturns);
          }),
        ),
        Match.tag("Convex", () =>
          Effect.promise(() =>
            this.testConvex.action(actionName as any, args as any),
          ),
        ),
        Match.exhaustive,
      );
    });

  readonly run: TestConfectWithoutIdentity<ConfectSchema>["run"] = (<
    A,
    B extends Value,
    E,
  >(
    handler: Effect.Effect<
      A,
      E,
      RegisteredConvexFunction.MutationServices<ConfectSchema>
    >,
    returns?: Schema.Schema<A, B>,
  ): Effect.Effect<void> | Effect.Effect<A, ParseResult.ParseError> => {
    const makeMutationLayer = (
      mutationCtx: GenericMutationCtx<
        DataModel.ToConvex<DataModel.FromSchema<ConfectSchema>>
      >,
    ): Layer.Layer<RegisteredConvexFunction.MutationServices<ConfectSchema>> =>
      RegisteredConvexFunction.mutationLayer(
        this.confectSchema,
        mutationCtx,
      ) as Layer.Layer<
        RegisteredConvexFunction.MutationServices<ConfectSchema>
      >;

    return returns === undefined
      ? Effect.promise(() =>
          this.testConvex.run((mutationCtx) =>
            Effect.runPromise(
              handler.pipe(
                Effect.asVoid,
                Effect.provide(makeMutationLayer(mutationCtx)),
              ),
            ),
          ),
        )
      : Effect.promise(() =>
          this.testConvex.run((mutationCtx) =>
            Effect.runPromise(
              handler.pipe(
                Effect.andThen(Schema.encode(returns)),
                Effect.provide(makeMutationLayer(mutationCtx)),
              ),
            ),
          ),
        ).pipe(Effect.andThen(Schema.decode(returns)));
  }) as TestConfectWithoutIdentity<ConfectSchema>["run"];

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

class TestConfectImpl<
  ConfectSchema extends DatabaseSchema.AnyWithProps,
> implements TestConfect<ConfectSchema> {
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
    args: Ref.Args<QueryRef>,
  ) => this.testConfectImplWithoutIdentity.query(queryRef, args);

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    args: Ref.Args<MutationRef>,
  ) => this.testConfectImplWithoutIdentity.mutation(mutationRef, args);

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    args: Ref.Args<ActionRef>,
  ) => this.testConfectImplWithoutIdentity.action(actionRef, args);

  readonly run: TestConfect<ConfectSchema>["run"] = ((
    handler: any,
    returns?: any,
  ) =>
    this.testConfectImplWithoutIdentity.run(
      handler,
      returns,
    )) as TestConfect<ConfectSchema>["run"];

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

export const layer =
  <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
    databaseSchema: DatabaseSchema_,
    modules: Record<string, () => Promise<any>>,
  ) =>
  (): Layer.Layer<TestConfect<DatabaseSchema_>> =>
    Layer.sync(
      TestConfect<DatabaseSchema_>(),
      () =>
        new TestConfectImpl(
          databaseSchema,
          convexTest(
            databaseSchema.convexSchemaDefinition,
            modules,
          ) as unknown as TestConvexForDataModelAndIdentity<
            DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
          >,
        ),
    );
