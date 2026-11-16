import { Ref } from "@confect/core";
import type { DatabaseSchema, DataModel } from "@confect/server";
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

/**
 * Upstream signing formats: DeploymentJwk is a public verification key;
 * DeploymentJwks contains its keys array. Use them to verify deployment JWTs
 * from the same test backend, not as private signing credentials.
 */
export type { DeploymentJwk, DeploymentJwks } from "convex-test";

/**
 * Test operations shared by the default caller and callers returned by
 * {@link TestConfect.withIdentity}. The name means this interface has no
 * identity-switching method; its calls can still run as an authenticated user.
 * All operations are lazy Effects against the same in-memory test backend.
 */
export type TestConfectWithoutIdentity<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = {
  /**
   * Read public keys that verify JWTs signed by this test backend's
   * MutationAuth. Keys belong to this backend instance. Native Promise
   * rejections are defects.
   */
  jwks: () => Effect.Effect<DeploymentJwks>;
  /**
   * Run a public or internal query with decoded arguments and decode its
   * result. Omit args only for a ref with no required arguments. Declared
   * function and middleware errors and `Schema.SchemaError` are typed failures;
   * undeclared backend failures are defects. Plain Convex refs pass values
   * through.
   */
  query: <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    ...args: Ref.OptionalArgs<QueryRef>
  ) => Effect.Effect<
    Ref.Returns<QueryRef>,
    Ref.Error<QueryRef> | Schema.SchemaError
  >;
  /**
   * Run a public or internal mutation with decoded arguments and return its
   * decoded result. Args may be omitted for a no-args ref. Declared errors and
   * `Schema.SchemaError` are typed failures; other backend failures are
   * defects. Plain Convex refs pass values through without schema conversion.
   */
  mutation: <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    ...args: Ref.OptionalArgs<MutationRef>
  ) => Effect.Effect<
    Ref.Returns<MutationRef>,
    Ref.Error<MutationRef> | Schema.SchemaError
  >;
  /**
   * Run a public or internal action, encoding args and decoding the result for
   * Confect refs. Omit args for a no-args ref. Declared errors and
   * `Schema.SchemaError` are typed failures; undeclared failures are defects.
   * Plain Convex refs retain their native args and result values.
   */
  action: <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    ...args: Ref.OptionalArgs<ActionRef>
  ) => Effect.Effect<
    Ref.Returns<ActionRef>,
    Ref.Error<ActionRef> | Schema.SchemaError
  >;
  /**
   * Execute setup code with schema-specialized mutation-context services.
   * Supply a return codec for non-void results. Handler failures and return
   * encoding failures cross a Promise boundary and become defects; return
   * decoding failures remain `Schema.SchemaError` in the typed error channel.
   */
  run: {
    /**
     * Run a void setup effect; discard its result and surface failures as
     * defects.
     */
    <E>(
      handler: Effect.Effect<
        void,
        E,
        RegisteredConvexFunction.MutationServices<DatabaseSchema_>
      >,
    ): Effect.Effect<void>;
    /**
     * Run setup and round-trip its result through `returns` before returning A.
     * The codec's encoded representation must be a Convex value.
     */
    <A, B extends Value, E>(
      handler: Effect.Effect<
        A,
        E,
        RegisteredConvexFunction.MutationServices<DatabaseSchema_>
      >,
      returns: Schema.Codec<A, B>,
    ): Effect.Effect<A, Schema.SchemaError>;
  };
  /**
   * Call an HTTP endpoint by path, query and fragment with optional web
   * `RequestInit` options. Returns the raw Response, including non-2xx
   * statuses; native rejections become defects.
   */
  fetch: (
    pathQueryFragment: string,
    init?: RequestInit,
  ) => Effect.Effect<Response>;
  /**
   * Wait for scheduled functions already in progress to finish. This does not
   * advance timers to start future work. Native rejections become defects.
   */
  finishInProgressScheduledFunctions: () => Effect.Effect<void>;
  /**
   * Drain scheduled work, using `advanceTimers` to advance the test's fake
   * clock between rounds (for example, `() => vi.runAllTimers()`). Includes
   * work scheduled by other scheduled functions and waits for success or
   * failure. Use fake timers during the call; real-timer jobs whose due time
   * has not arrived cannot be forced to run by advancing fake timers. The
   * upstream iteration limit applies. Native rejections become defects.
   */
  finishAllScheduledFunctions: (
    advanceTimers: () => void,
  ) => Effect.Effect<void>;
};

/**
 * Test caller with operations from {@link TestConfectWithoutIdentity} and
 * identity selection.
 */
export type TestConfect<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> = {
  /**
   * Return a caller scoped to a partial Convex UserIdentity without changing
   * this caller or creating another database. Missing identity fields follow
   * `convex-test` defaults; the returned caller cannot switch identities
   * again.
   */
  withIdentity: (
    userIdentity: Partial<UserIdentity>,
  ) => TestConfectWithoutIdentity<DatabaseSchema_>;
} & TestConfectWithoutIdentity<DatabaseSchema_>;

/**
 * Create the service tag specialized to your generated runtime database schema.
 * Provide {@link layer} to supply the in-memory backend; acquire the tag inside
 * an Effect to access the test operations.
 *
 * @example
 *   const Test = TestConfect<typeof databaseSchema>();
 *   const program = Effect.gen(function* () {
 *     const test = yield* Test;
 *     return yield* test.query(refs.public.notes.list);
 *   });
 */
export const TestConfect = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>() =>
  Context.Service<TestConfect<DatabaseSchema_>>("@confect/test/TestConfect");

class TestConfectImplWithoutIdentity<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> implements TestConfectWithoutIdentity<DatabaseSchema_> {
  constructor(
    private confectSchema: DatabaseSchema_,
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
    handler: Effect.Effect<
      A,
      E,
      RegisteredConvexFunction.MutationServices<DatabaseSchema_>
    >,
    returns?: Schema.Codec<A, B>,
  ): Effect.Effect<void> | Effect.Effect<A, Schema.SchemaError> => {
    const makeMutationLayer = (
      mutationCtx: GenericMutationCtx<
        DataModel.ToConvexDataModel<
          DataModel.FromDatabaseSchema<DatabaseSchema_>
        >
      >,
    ): Layer.Layer<
      RegisteredConvexFunction.MutationServices<DatabaseSchema_>
    > =>
      RegisteredConvexFunction.mutationLayer(
        this.confectSchema,
        mutationCtx,
      ) as Layer.Layer<
        RegisteredConvexFunction.MutationServices<DatabaseSchema_>
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
    private confectSchema: DatabaseSchema_,
    private testConvex: TestConvexForDataModelAndIdentity<
      DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >,
  ) {
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

/**
 * Supply a test backend for the schema-specialized {@link TestConfect} tag. Each
 * layer build creates a fresh in-memory database; provide it separately per
 * test for isolation or share a built layer to share state.
 *
 * @param databaseSchema - Generated Confect runtime schema used for service
 *   codecs.
 * @param convexSchemaDefinition - Generated deployment schema used by
 *   `convex-test`.
 * @param modules - Convex modules, typically an `import.meta.glob` result.
 *
 * @returns A synchronous layer. Backend construction failures are defects.
 */
export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexSchemaDefinition: SchemaDefinition<GenericSchema, true>,
  modules: Record<string, () => Promise<any>>,
): Layer.Layer<TestConfect<DatabaseSchema_>> =>
  Layer.sync(
    TestConfect<DatabaseSchema_>(),
    () =>
      new TestConfectImpl(
        databaseSchema,
        convexTest(convexSchemaDefinition, modules) as any,
      ),
  );
