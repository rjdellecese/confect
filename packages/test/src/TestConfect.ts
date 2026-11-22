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

/**
 * Public verification key (`DeploymentJwk`) and key set (`DeploymentJwks`) for
 * JWTs signed by a test backend. The set contains public keys, not signing
 * credentials.
 *
 * @category Models
 */
export type { DeploymentJwk, DeploymentJwks } from "convex-test";

/**
 * Operations for testing functions, HTTP routes, and scheduled work against an
 * in-memory backend. An identity-scoped caller has these same operations but
 * cannot switch identities again.
 *
 * **Details**
 *
 * Queries, mutations, and actions accept decoded arguments for Confect
 * references and pass native Convex values through unchanged. Declared function
 * and middleware errors and `Schema.SchemaError` are typed failures. Other
 * backend failures are defects.
 *
 * @category Services
 */
export type TestConfectWithoutIdentity<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = {
  /**
   * Reads the public keys that verify JWTs signed by this backend's
   * `MutationAuth`. A rejected key lookup is a defect.
   *
   * @category Getters
   */
  jwks: () => Effect.Effect<DeploymentJwks>;
  /**
   * Runs a public or internal query and returns its decoded result. Omit the
   * arguments only when the reference has no required arguments.
   *
   * @category Running
   */
  query: <QueryRef extends Ref.AnyQuery>(
    queryRef: QueryRef,
    ...args: Ref.OptionalArgs<QueryRef>
  ) => Effect.Effect<
    Ref.Returns<QueryRef>,
    Ref.Error<QueryRef> | Schema.SchemaError
  >;
  /**
   * Runs a public or internal mutation against the test database and returns
   * its decoded result. Omit the arguments for a reference with no required
   * arguments.
   *
   * @category Running
   */
  mutation: <MutationRef extends Ref.AnyMutation>(
    mutationRef: MutationRef,
    ...args: Ref.OptionalArgs<MutationRef>
  ) => Effect.Effect<
    Ref.Returns<MutationRef>,
    Ref.Error<MutationRef> | Schema.SchemaError
  >;
  /**
   * Runs a public or internal action with the given arguments and returns its
   * decoded result. For a reference with no required arguments, pass the
   * reference alone.
   *
   * @category Running
   */
  action: <ActionRef extends Ref.AnyAction>(
    actionRef: ActionRef,
    ...args: Ref.OptionalArgs<ActionRef>
  ) => Effect.Effect<
    Ref.Returns<ActionRef>,
    Ref.Error<ActionRef> | Schema.SchemaError
  >;
  /**
   * Runs a setup Effect in a mutation transaction, with the database services
   * for this application's schema. Pass a return codec to get a value back.
   *
   * **When to use**
   *
   * Use to seed data or inspect stored state directly, without invoking a
   * registered function.
   *
   * **Details**
   *
   * Inside the transaction, `DocumentIds.identify` checks the application table
   * names supplied to the layer and Convex's system tables. It cannot discover
   * extra tables in the test deployment.
   *
   * **Gotchas**
   *
   * Handler failures and return-encoding failures cross a Promise boundary and
   * become defects. A failure decoding the returned value remains a typed
   * `Schema.SchemaError`.
   *
   * @category Running
   */
  run: {
    /**
     * Runs a setup Effect for its side effects, discards its result, and
     * surfaces handler failures as defects.
     *
     * @category Running
     */
    <E>(
      handler: Effect.Effect<
        void,
        E,
        Handler.MutationServices<DatabaseSchema_>
      >,
    ): Effect.Effect<void>;
    /**
     * Runs a setup Effect and returns its result after encoding and decoding it
     * with `returns`. The codec must encode to a Convex value.
     *
     * @category Running
     */
    <A, B extends Value, E>(
      handler: Effect.Effect<A, E, Handler.MutationServices<DatabaseSchema_>>,
      returns: Schema.Codec<A, B>,
    ): Effect.Effect<A, Schema.SchemaError>;
  };
  /**
   * Calls an HTTP endpoint with the given path, optional query and fragment,
   * and standard fetch options. Returns the raw `Response` even for a non-2xx
   * status; a rejected request is a defect.
   *
   * @category Running
   */
  fetch: (
    pathQueryFragment: string,
    init?: RequestInit,
  ) => Effect.Effect<Response>;
  /**
   * Waits for scheduled functions that have already started to finish or fail.
   * It does not advance the clock to start future work. A rejection from the
   * test backend is a defect.
   *
   * @category Scheduling
   *
   * @see {@link TestConfectWithoutIdentity.finishAllScheduledFunctions} to advance the clock and drain newly scheduled work.
   */
  finishInProgressScheduledFunctions: () => Effect.Effect<void>;
  /**
   * Advances the test clock and waits for scheduled functions to finish or
   * fail, including functions they schedule in turn.
   *
   * **Gotchas**
   *
   * Keep fake timers active during the call. Advancing them cannot start work
   * scheduled under real timers whose due time has not arrived. If the backend
   * reaches its iteration limit or the timer callback throws, the Effect dies.
   *
   * @category Scheduling
   *
   * @param advanceTimers - Advances the test's fake timers, for example `() =>
   *   vi.runAllTimers()`.
   */
  finishAllScheduledFunctions: (
    advanceTimers: () => void,
  ) => Effect.Effect<void>;
};

/**
 * Test caller that can select a user identity and run all the operations in
 * {@link TestConfectWithoutIdentity} against one in-memory backend.
 *
 * @category Services
 */
export type TestConfect<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> = {
  /**
   * Returns a caller with the given identity without changing the original
   * caller or creating another database. The test backend fills in a missing
   * issuer, subject, or token identifier. To switch users again, call this
   * method on the original caller.
   *
   * @category Combinators
   */
  withIdentity: (
    userIdentity: Partial<UserIdentity>,
  ) => TestConfectWithoutIdentity<DatabaseSchema_>;
} & TestConfectWithoutIdentity<DatabaseSchema_>;

/**
 * Creates a service tag for the generated database schema type. Provide
 * {@link layer} to run Effects that acquire the tag and call the in-memory
 * backend.
 *
 * **Example** (Calling the notes query from a test)
 *
 * ```ts
 * import { TestConfect } from "@confect/test";
 * import refs from "confect/_generated/refs";
 * import type schema from "confect/_generated/schema";
 * import * as Effect from "effect/Effect";
 *
 * const Test = TestConfect.TestConfect<typeof schema>();
 * export const listNotes = Effect.gen(function* () {
 *   const test = yield* Test;
 *   return yield* test.query(refs.public.notes_and_random.notes.list);
 * });
 * ```
 *
 * @category Tags
 */
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

/**
 * Creates a layer that supplies the schema-specialized {@link TestConfect}
 * service with an in-memory Convex backend.
 *
 * **Details**
 *
 * Each build creates a fresh database. Build the layer separately for each test
 * to isolate its state, or share the built layer to use the same data across
 * calls.
 *
 * **Example** (Building a layer from generated test artifacts)
 *
 * ```ts
 * import { TestConfect } from "@confect/test";
 * import convexSchema from "confect/_generated/convexSchema";
 * import type schema from "confect/_generated/schema";
 * import tableNames from "confect/_generated/tableNames";
 *
 * export const makeTestLayer = (
 *   modules: Record<string, () => Promise<unknown>>,
 * ) => TestConfect.layer<typeof schema>(tableNames, convexSchema, modules);
 * ```
 *
 * @category Layers
 *
 * @param tableNames - Default export of `_generated/tableNames`. In `run`,
 *   these are the application tables that `DocumentIds.identify` can match.
 * @param convexSchemaDefinition - Generated Convex deployment schema used by
 *   `convex-test`.
 * @param modules - Convex modules, typically the result of `import.meta.glob`.
 *
 * @returns A synchronous layer. Backend construction failures are defects.
 */
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
