import { Ref } from "@confect/core";
import type { DatabaseSchema, DataModel, Handler } from "@confect/server";
import { RegisteredConvexFunction } from "@confect/server";
import type {
  DeploymentJwks,
  TestConvexForDataModel,
  TestConvexForDataModelAndIdentity,
} from "convex-test";
import { convexTest } from "convex-test";
import type {
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
  UserIdentity,
} from "convex/server";
import type { Value } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

export type { DeploymentJwk, DeploymentJwks } from "convex-test";

export type TestConfectWithoutIdentity<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = {
  jwks: () => Effect.Effect<DeploymentJwks>;
  query: <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    ...args: Ref.OptionalArgs<QueryRef>
  ) => Effect.Effect<
    Ref.Returns<QueryRef>,
    Ref.Error<QueryRef> | Schema.SchemaError
  >;
  mutation: <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    ...args: Ref.OptionalArgs<MutationRef>
  ) => Effect.Effect<
    Ref.Returns<MutationRef>,
    Ref.Error<MutationRef> | Schema.SchemaError
  >;
  action: <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    ...args: Ref.OptionalArgs<ActionRef>
  ) => Effect.Effect<
    Ref.Returns<ActionRef>,
    Ref.Error<ActionRef> | Schema.SchemaError
  >;
  run: {
    <E>(
      handler: Effect.Effect<
        void,
        E,
        Handler.MutationServices<DatabaseSchema_>
      >,
    ): Effect.Effect<void>;
    <A, B extends Value, E>(
      handler: Effect.Effect<A, E, Handler.MutationServices<DatabaseSchema_>>,
      returns: Schema.Codec<A, B>,
    ): Effect.Effect<A, Schema.SchemaError>;
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

export type TestConfect<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> = {
  withIdentity: (
    userIdentity: Partial<UserIdentity>,
  ) => TestConfectWithoutIdentity<DatabaseSchema_>;
} & TestConfectWithoutIdentity<DatabaseSchema_>;

export const TestConfect = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>() =>
  Context.Service<TestConfect<DatabaseSchema_>>("@confect/test/TestConfect");

class TestConfectImplWithoutIdentity<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> implements TestConfectWithoutIdentity<DatabaseSchema_> {
  constructor(
    private readonly tableNames: ReadonlyArray<
      DatabaseSchema.TableNames<DatabaseSchema_>
    >,
    private testConvex: TestConvexForDataModel<
      DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >,
  ) {}

  readonly jwks = Effect.fn("TestConfect.jwks")(() =>
    Effect.promise(() => this.testConvex.jwks()),
  );

  readonly query = <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    ...args: Ref.OptionalArgs<QueryRef>
  ): Effect.Effect<
    Ref.Returns<QueryRef>,
    Ref.Error<QueryRef> | Schema.SchemaError
  > =>
    Ref.runWithCodec(
      queryRef,
      (args[0] ?? {}) as Ref.Args<QueryRef>,
      (functionReference, encodedArgs) =>
        this.testConvex.query(functionReference as any, encodedArgs),
    );

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    ...args: Ref.OptionalArgs<MutationRef>
  ): Effect.Effect<
    Ref.Returns<MutationRef>,
    Ref.Error<MutationRef> | Schema.SchemaError
  > =>
    Ref.runWithCodec(
      mutationRef,
      (args[0] ?? {}) as Ref.Args<MutationRef>,
      (functionReference, encodedArgs) =>
        this.testConvex.mutation(functionReference as any, encodedArgs),
    );

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    ...args: Ref.OptionalArgs<ActionRef>
  ): Effect.Effect<
    Ref.Returns<ActionRef>,
    Ref.Error<ActionRef> | Schema.SchemaError
  > =>
    Ref.runWithCodec(
      actionRef,
      (args[0] ?? {}) as Ref.Args<ActionRef>,
      (functionReference, encodedArgs) =>
        this.testConvex.action(functionReference as any, encodedArgs),
    );

  readonly run: TestConfectWithoutIdentity<DatabaseSchema_>["run"] = (<
    A,
    B extends Value,
    E,
  >(
    handler: Effect.Effect<A, E, Handler.MutationServices<DatabaseSchema_>>,
    returns?: Schema.Codec<A, B>,
  ): Effect.Effect<void> | Effect.Effect<A, Schema.SchemaError> => {
    const makeMutationLayer = (
      mutationCtx: GenericMutationCtx<
        DataModel.ToConvexDataModel<
          DataModel.FromDatabaseSchema<DatabaseSchema_>
        >
      >,
    ) =>
      RegisteredConvexFunction.mutationLayer<DatabaseSchema_>(
        this.tableNames,
        mutationCtx,
      );

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
                Effect.andThen(Schema.encodeEffect(returns)),
                Effect.provide(makeMutationLayer(mutationCtx)),
              ),
            ),
          ),
        ).pipe(Effect.andThen(Schema.decodeEffect(returns)));
  }) as TestConfectWithoutIdentity<DatabaseSchema_>["run"];

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
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> implements TestConfect<DatabaseSchema_> {
  private readonly testConfectImplWithoutIdentity: TestConfectImplWithoutIdentity<DatabaseSchema_>;

  constructor(
    private readonly tableNames: ReadonlyArray<
      DatabaseSchema.TableNames<DatabaseSchema_>
    >,
    private testConvex: TestConvexForDataModelAndIdentity<
      DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >,
  ) {
    this.testConfectImplWithoutIdentity = new TestConfectImplWithoutIdentity(
      tableNames,
      testConvex,
    );
  }

  readonly withIdentity = (userIdentity: Partial<UserIdentity>) =>
    new TestConfectImplWithoutIdentity(
      this.tableNames,
      this.testConvex.withIdentity(userIdentity),
    );

  readonly jwks = () => this.testConfectImplWithoutIdentity.jwks();

  readonly query = <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    ...args: Ref.OptionalArgs<QueryRef>
  ) => this.testConfectImplWithoutIdentity.query(queryRef, ...args);

  readonly mutation = <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    ...args: Ref.OptionalArgs<MutationRef>
  ) => this.testConfectImplWithoutIdentity.mutation(mutationRef, ...args);

  readonly action = <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    ...args: Ref.OptionalArgs<ActionRef>
  ) => this.testConfectImplWithoutIdentity.action(actionRef, ...args);

  readonly run: TestConfect<DatabaseSchema_>["run"] = ((
    handler: any,
    returns?: any,
  ) =>
    this.testConfectImplWithoutIdentity.run(
      handler,
      returns,
    )) as TestConfect<DatabaseSchema_>["run"];

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

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  tableNames: ReadonlyArray<DatabaseSchema.TableNames<DatabaseSchema_>>,
  convexSchemaDefinition: SchemaDefinition<
    Record<DatabaseSchema.TableNames<DatabaseSchema_>, GenericSchema[string]>,
    true
  >,
  modules: Record<string, () => Promise<any>>,
): Layer.Layer<TestConfect<DatabaseSchema_>> =>
  Layer.sync(
    TestConfect<DatabaseSchema_>(),
    () =>
      new TestConfectImpl<DatabaseSchema_>(
        tableNames,
        convexTest(convexSchemaDefinition, modules) as any,
      ),
  );
