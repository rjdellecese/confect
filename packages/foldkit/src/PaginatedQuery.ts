import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as PaginationError from "@confect/core/PaginationError";
import * as Ref from "@confect/core/Ref";
import * as Data from "effect/Data";
import * as Function from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Client from "./Client";

/**
 * Cursor range requested for one page. An unpinned range can grow; a pinned
 * range ends at a fixed cursor.
 *
 * @category Models
 */
export interface PageDescriptor {
  /**
   * Cursor before the page; null starts at the beginning of the query.
   *
   * @category Models
   */
  readonly cursor: string | null;
  /**
   * Fixed range end when pinned; None requests a growing page.
   *
   * @category Models
   */
  readonly endCursor: Option.Option<string>;
}

/**
 * Codec for a page's start cursor and optional pinned end cursor.
 *
 * @category Schemas
 */
export const PageDescriptor = Schema.Struct({
  cursor: Schema.Union([Schema.String, Schema.Null]),
  endCursor: Schema.Option(Schema.String),
});

/**
 * Options that remain fixed for one pagination session.
 *
 * @category Configuration
 */
export interface Options {
  /**
   * Positive integer target size for a new page; pinned ranges may return more
   * or fewer items.
   *
   * @category Configuration
   */
  readonly initialNumItems: number;
  /**
   * Optional positive integer row-read budget forwarded to each server page
   * request.
   *
   * @category Configuration
   */
  readonly maximumRowsRead?: number;
  /**
   * Optional positive integer byte-read budget forwarded to each server page
   * request.
   *
   * @category Configuration
   */
  readonly maximumBytesRead?: number;
}

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * Schema for a session's page size and optional per-page read budgets. Each
 * supplied value must be a positive integer.
 *
 * @category Schemas
 */
export const Options = Schema.Struct({
  initialNumItems: PositiveInt,
  maximumRowsRead: Schema.optionalKey(PositiveInt),
  maximumBytesRead: Schema.optionalKey(PositiveInt),
});

/**
 * Reason the machine is fetching a page: starting or resetting a session,
 * navigating to another page, or reloading a narrowed range after a split.
 *
 * @category Models
 */
export type Direction =
  | "Initial"
  | "Next"
  | "Previous"
  | "First"
  | "Split"
  | "Reset";

/**
 * A complete page that can remain on screen while another page is fetched.
 *
 * @category Models
 */
export interface Page<Item_> {
  /**
   * The cursor range that produced this displayed page.
   *
   * @category Models
   */
  readonly descriptor: PageDescriptor;
  /**
   * One-based displayed page number, which can differ from targetPageNumber
   * while refreshing.
   *
   * @category Models
   */
  readonly number: number;
  /**
   * Complete decoded items retained while another page loads or a refresh
   * fails.
   *
   * @category Models
   */
  readonly items: ReadonlyArray<Item_>;
  /**
   * Server cursor after these items, used to start or pin the next range.
   *
   * @category Models
   */
  readonly continueCursor: string;
  /**
   * Whether the server reported the end of the query for this page.
   *
   * @category Models
   */
  readonly isDone: boolean;
}

/**
 * An active request with no complete page to display yet.
 *
 * @category Models
 */
export type Loading = Data.TaggedEnum<{
  Loading: {
    /**
     * Reason the current request is loading.
     *
     * @category Models
     */
    readonly direction: Direction;
  };
}>;

/**
 * An active request retaining the last complete page while another range loads.
 *
 * @category Models
 */
export type Refreshing<Item_> = Data.TaggedEnum<{
  Refreshing: {
    /**
     * Last complete page, not necessarily the current request's target page.
     *
     * @category Models
     */
    readonly data: Page<Item_>;
    /**
     * Navigation, reset or split that caused this refresh.
     *
     * @category Models
     */
    readonly direction: Direction;
  };
}>;

/**
 * A complete current page; its subscription remains live for server updates.
 *
 * @category Models
 */
export type Success<Item_> = Data.TaggedEnum<{
  Success: {
    /**
     * The current complete page.
     *
     * @category Models
     */
    readonly data: Page<Item_>;
  };
}>;

/**
 * A failed active request with no previously completed page to retain.
 *
 * @category Models
 */
export type Failure<Error_> = Data.TaggedEnum<{
  Failure: {
    /**
     * Latest failure; the live subscription may still recover.
     *
     * @category Models
     */
    readonly error: Error_;
  };
}>;

/**
 * A failed active request retaining the last complete page beside the error.
 *
 * @category Models
 */
export type Stale<Item_, Error_> = Data.TaggedEnum<{
  Stale: {
    /**
     * Last complete page, retained rather than replaced by partial data.
     *
     * @category Models
     */
    readonly data: Page<Item_>;
    /**
     * Failure of the current request or refresh.
     *
     * @category Models
     */
    readonly error: Error_;
  };
}>;

/**
 * Tagged status inside an Active session, distinct from the outer Idle/Active
 * tag.
 *
 * @category Models
 */
export type Phase<Item_, Error_> =
  | Loading
  | Refreshing<Item_>
  | Success<Item_>
  | Failure<Error_>
  | Stale<Item_, Error_>;

interface PhaseDefinition extends Data.TaggedEnum.WithGenerics<2> {
  readonly taggedEnum: Phase<this["A"], this["B"]>;
}

const Phase = Data.taggedEnum<PhaseDefinition>();

/**
 * A closed machine that retains its generation for stale-result rejection.
 *
 * @category Models
 */
export type Idle = Data.TaggedEnum<{
  Idle: {
    /**
     * Last session generation; init advances it to reject late settlements.
     *
     * @category Models
     */
    readonly generation: number;
  };
}>;

/**
 * A live cursor-pagination session.
 *
 * @category Models
 */
export type Active<Item_, UserArgs_, Error_> = Data.TaggedEnum<{
  Active: {
    /**
     * Session generation advanced by init, reinitialize and reset.
     *
     * @category Models
     */
    readonly generation: number;
    /**
     * Decoded user arguments, excluding paginationOpts.
     *
     * @category Models
     */
    readonly args: UserArgs_;
    /**
     * Page size and read budgets fixed for this session.
     *
     * @category Models
     */
    readonly options: Options;
    /**
     * Convex cache-busting id; None until the subscription's first settlement.
     *
     * @category Models
     */
    readonly paginationId: Option.Option<number>;
    /**
     * Request revision used to reject settlements from superseded page targets.
     *
     * @category Models
     */
    readonly requestId: number;
    /**
     * Requested range, which can differ from the retained displayed page.
     *
     * @category Models
     */
    readonly current: PageDescriptor;
    /**
     * Previously visited pinned ranges, oldest first; the final entry is the
     * previous page.
     *
     * @category Models
     */
    readonly prevStack: ReadonlyArray<PageDescriptor>;
    /**
     * Loading, data or error state within this live session.
     *
     * @category Models
     */
    readonly phase: Phase<Item_, Error_>;
  };
}>;

/**
 * Cursor-pagination state stored in the Foldkit Model. `Idle` closes the
 * subscription; `Active` carries the session and its current phase. The
 * transition functions return new states without mutating their inputs.
 *
 * @category Models
 */
export type State<Item_, UserArgs_, Error_> =
  | Idle
  | Active<Item_, UserArgs_, Error_>;

interface StateDefinition extends Data.TaggedEnum.WithGenerics<3> {
  readonly taggedEnum: State<this["A"], this["B"], this["C"]>;
}

const State = Data.taggedEnum<StateDefinition>();

/**
 * Logical page request used to start or keep a subscription. It carries the
 * current cursor range and session identity before the client allocates a
 * pagination ID.
 *
 * @category Models
 */
export interface SubscriptionRequest<UserArgs_> {
  /**
   * Session generation copied from the active Model state.
   *
   * @category Models
   */
  readonly generation: number;
  /**
   * Decoded user arguments without paginationOpts.
   *
   * @category Models
   */
  readonly args: UserArgs_;
  /**
   * Session page-size and read-budget settings.
   *
   * @category Models
   */
  readonly options: Options;
  /**
   * Previously installed cache id, or None before allocation.
   *
   * @category Models
   */
  readonly paginationId: Option.Option<number>;
  /**
   * Revision identifying the current page target.
   *
   * @category Models
   */
  readonly requestId: number;
  /**
   * Cursor range requested from the server.
   *
   * @category Models
   */
  readonly descriptor: PageDescriptor;
}

/**
 * The complete identity and arguments of a subscribed page request.
 *
 * @category Models
 */
export interface Request<UserArgs_> {
  /**
   * Session generation used to correlate this outcome with Model state.
   *
   * @category Models
   */
  readonly generation: number;
  /**
   * Decoded user arguments sent with this request.
   *
   * @category Models
   */
  readonly args: UserArgs_;
  /**
   * Page-size and read-budget settings used for the request.
   *
   * @category Models
   */
  readonly options: Options;
  /**
   * Allocated Convex cache-busting session id.
   *
   * @category Models
   */
  readonly paginationId: number;
  /**
   * Page-target revision checked by settle before accepting this request's
   * outcome.
   *
   * @category Models
   */
  readonly requestId: number;
  /**
   * Start cursor and optional pinned end cursor for this request.
   *
   * @category Models
   */
  readonly descriptor: PageDescriptor;
}

/**
 * The successful payload returned by a Convex paginated query.
 *
 * @category Models
 */
export interface PageResult<Item_> {
  /**
   * Decoded items returned by the server, possibly partial when a split is
   * required.
   *
   * @category Models
   */
  readonly page: ReadonlyArray<Item_>;
  /**
   * Whether this result reaches the end of the query.
   *
   * @category Models
   */
  readonly isDone: boolean;
  /**
   * Cursor immediately after the returned page.
   *
   * @category Models
   */
  readonly continueCursor: string;
  /**
   * Server-provided boundary at which an oversized range can be split.
   *
   * @category Models
   */
  readonly splitCursor?: string | null;
  /**
   * Whether a split is recommended or required before displaying a complete
   * page.
   *
   * @category Models
   */
  readonly pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

/**
 * A page result or failure paired with the request that produced it. Pass this
 * value to `settle` so late results cannot overwrite the current page.
 *
 * @category Models
 */
export interface Settlement<Item_, UserArgs_, Error_> {
  /**
   * Complete request identity; stale identities are ignored by settle.
   *
   * @category Models
   */
  readonly request: Request<UserArgs_>;
  /**
   * Decoded page or failure; both outcomes travel through the same Message
   * path.
   *
   * @category Models
   */
  readonly result: Result.Result<PageResult<Item_>, Error_>;
}

/**
 * Decoded type of one item in a paginated query's `page` array.
 *
 * @category Utility types
 */
export type Item<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];

/**
 * Decoded arguments supplied by the caller, excluding the `paginationOpts` that
 * the machine supplies.
 *
 * @category Utility types
 */
export type UserArgs<Query extends Ref.AnyConfectPublicPaginatedQuery> = Omit<
  Ref.Args<Query>,
  "paginationOpts"
>;

/**
 * Tagged payload distinguishing a failure declared by the query from a client
 * failure.
 *
 * @category Errors
 */
type TaggedFunctionError<Error_> = Data.TaggedEnum<{
  FunctionError: {
    /**
     * Decoded error declared by the query or one of its middleware specs.
     *
     * @category Errors
     */
    readonly error: Error_;
  };
}>;

interface FunctionErrorDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: TaggedFunctionError<this["A"]>;
}

/**
 * Wraps a decoded query or middleware error in a tagged `FunctionError` value.
 * The result has an `error` field; it is not a thrown exception or an `Error`
 * subclass.
 *
 * @category Constructors
 */
export const FunctionError =
  Data.taggedEnum<FunctionErrorDefinition>().FunctionError;

/**
 * Tagged failure containing the decoded error declared by the query or its
 * middleware. This type is `never` for a ref that declares neither kind of
 * error.
 *
 * @category Errors
 */
export type FunctionError<Query extends Ref.AnyConfectPublicPaginatedQuery> = [
  Ref.Error<Query>,
] extends [never]
  ? never
  : TaggedFunctionError<Ref.Error<Query>>;

/**
 * Failures a paginated query can deliver in a settlement. `FunctionError` wraps
 * declared errors, `WebSocketClientError` carries unexpected client or backend
 * failures, and `Schema.SchemaError` reports codec failures. `InvalidCursor`
 * tells the machine to restart the session.
 *
 * @category Errors
 */
export type Error<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  | FunctionError<Query>
  | PaginationError.InvalidCursor
  | Client.WebSocketClientError
  | Schema.SchemaError;

/**
 * Pagination error with the underlying invalid-cursor cause. On this failure,
 * `settle` returns the machine to page one and retains any complete page rather
 * than entering `Failure` or `Stale`.
 *
 * @category Errors
 */
export { InvalidCursor } from "@confect/core/PaginationError";

type MachineState<Query extends Ref.AnyConfectPublicPaginatedQuery> = State<
  Item<Query>,
  UserArgs<Query>,
  Error<Query>
>;

type MachineActive<Query extends Ref.AnyConfectPublicPaginatedQuery> = Active<
  Item<Query>,
  UserArgs<Query>,
  Error<Query>
>;

/**
 * Model and Message codecs, initial state, and session constructors for one
 * paginated query ref.
 *
 * @category Models
 */
export interface PaginatedQuery<
  Query extends Ref.AnyConfectPublicPaginatedQuery,
> {
  /**
   * @internal
   */
  readonly ref: Query;
  /**
   * Model codec for Idle/Active state, decoded args, retained pages and
   * failures.
   *
   * @category Schemas
   */
  readonly schema: Schema.Codec<MachineState<Query>, unknown>;
  /**
   * Initial closed state with generation zero; use close to preserve a used
   * session's generation.
   *
   * @category Models
   */
  readonly idle: Idle;
  /**
   * @internal
   */
  readonly subscriptionRequestSchema: Schema.Codec<
    SubscriptionRequest<UserArgs<Query>>,
    unknown
  >;
  /**
   * @internal
   */
  readonly requestSchema: Schema.Codec<Request<UserArgs<Query>>, unknown>;
  /**
   * Codec for correlated outcomes; use it as the payload schema of a settlement
   * Message.
   *
   * @category Schemas
   */
  readonly settlement: Schema.Codec<
    Settlement<Item<Query>, UserArgs<Query>, Error<Query>>,
    unknown
  >;
  /**
   * Opens an idle machine at page one with a new generation and no retained
   * page. Pass `(idle, args, options)`, or `(idle, options)` for a query with
   * no user arguments. The transition is pure; the subscription observes the
   * new state and makes the request.
   *
   * **Gotchas**
   *
   * `initialNumItems` and any supplied read budgets must be positive integers.
   * Invalid options throw synchronously.
   *
   * @category Lifecycle
   */
  readonly init: keyof UserArgs<Query> extends never
    ? (state: Idle, options: Options) => MachineActive<Query>
    : (
        state: Idle,
        args: UserArgs<Query>,
        options: Options,
      ) => MachineActive<Query>;
  /**
   * Starts a new session at page one with new arguments, discarding the
   * previously displayed page. Pass `(active, args, options?)`, or `(active,
   * options?)` for a query with no user arguments. Omitted options retain the
   * current settings; invalid options throw synchronously.
   *
   * @category Lifecycle
   */
  readonly reinitialize: keyof UserArgs<Query> extends never
    ? (state: MachineActive<Query>, options?: Options) => MachineActive<Query>
    : (
        state: MachineActive<Query>,
        args: UserArgs<Query>,
        options?: Options,
      ) => MachineActive<Query>;
}

/**
 * Type of a pagination machine when a caller does not need the specific query
 * ref.
 *
 * @category Utility types
 */
export type Any = PaginatedQuery<Ref.AnyConfectPublicPaginatedQuery>;

const firstDescriptor = (): PageDescriptor => ({
  cursor: null,
  endCursor: Option.none(),
});

const initialState = <Item_, UserArgs_, Error_>(
  generation: number,
  args: UserArgs_,
  options: Options,
): Active<Item_, UserArgs_, Error_> =>
  State.Active<Item_, UserArgs_, Error_>({
    generation,
    args,
    options: Schema.decodeResult(Options)(options).pipe(Result.getOrThrow),
    paginationId: Option.none(),
    requestId: 1,
    current: firstDescriptor(),
    prevStack: [],
    phase: Phase.Loading<Item_, Error_>({ direction: "Initial" }),
  });

const missingPaginatedProvenanceError = (ref: Ref.AnyConfect) =>
  new globalThis.Error(
    `Paginated query ref "${Ref.getConvexFunctionName(ref)}" was not built ` +
      "with `FunctionSpec.publicPaginatedQuery`. `PaginatedQuery.make` " +
      "requires the user-args and item schemas that constructor stores.",
  );

const paginatedKindOrThrow = (ref: Ref.AnyConfectPublicPaginatedQuery) =>
  Match.value(ref.kind).pipe(
    Match.tag("Paginated", (kind) => kind),
    Match.tag("Standard", () => {
      throw missingPaginatedProvenanceError(ref);
    }),
    Match.exhaustive,
  );

const SchemaErrorJson = Schema.TaggedStruct("SchemaError", {
  message: Schema.String,
});

const SerializableSchemaError = Schema.instanceOf(Schema.SchemaError, {
  toCodecJson: () =>
    Schema.link<Schema.SchemaError>()(SchemaErrorJson, {
      decode: SchemaGetter.transform(
        ({ message }) =>
          new Schema.SchemaError(new SchemaIssue.InvalidValue({ message })),
      ),
      encode: SchemaGetter.transform((error) =>
        SchemaErrorJson.make({ message: error.message }),
      ),
    }),
});

/**
 * Creates a pagination machine from a public paginated query ref. The machine
 * supplies the codecs for Model state and settlement Messages without opening a
 * network subscription.
 *
 * **Example** (Starting a notes session at page one)
 *
 * ```ts
 * import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";
 * import refs from "confect/_generated/refs";
 *
 * const Notes = PaginatedQuery.make(
 *   refs.public.notes_and_random.notes.listPaginated,
 * );
 * export const state = Notes.init(Notes.idle, { initialNumItems: 20 });
 * ```
 *
 * @category Constructors
 *
 * @param ref - Ref created with FunctionSpec.publicPaginatedQuery, carrying
 *   user-args and item codecs. Other query kinds throw during construction.
 *
 * @returns Model and settlement codecs, an initial Idle state and pure init /
 *   reinitialize functions. No subscription or network request is started here.
 *   Use Subscription.paginatedQuery to connect the machine to the client.
 */
export const make = <Query extends Ref.AnyConfectPublicPaginatedQuery>(
  ref: Query,
): PaginatedQuery<Query> => {
  const kind = paginatedKindOrThrow(ref);
  const hasUserArgs = Record.keys(kind.userArgs.fields).length > 0;
  const functionErrorSchemas = [
    ...("error" in ref && ref.error !== undefined ? [ref.error] : []),
    ...MiddlewareSpec.errorSchemas(ref.middlewareSpecs),
  ];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The public Error<Query> includes FunctionError exactly when the ref or its middleware contributes an error codec below.
  const errorSchema = Schema.Union([
    PaginationError.InvalidCursor,
    Client.WebSocketClientError,
    SerializableSchemaError,
    ...(functionErrorSchemas.length === 0
      ? []
      : [
          Schema.TaggedStruct("FunctionError", {
            error:
              functionErrorSchemas.length === 1
                ? functionErrorSchemas[0]
                : Schema.Union(functionErrorSchemas),
          }),
        ]),
  ]) as Schema.Codec<Error<Query>, unknown>;
  const directions = Schema.Literals([
    "Initial",
    "Next",
    "Previous",
    "First",
    "Split",
    "Reset",
  ]);
  const page = Schema.Struct({
    descriptor: PageDescriptor,
    number: PositiveInt,
    items: kind.page,
    continueCursor: Schema.String,
    isDone: Schema.Boolean,
  });
  const phase = Schema.TaggedUnion({
    Loading: { direction: directions },
    Refreshing: { data: page, direction: directions },
    Success: { data: page },
    Failure: { error: errorSchema },
    Stale: { data: page, error: errorSchema },
  });
  const subscriptionRequestSchema: PaginatedQuery<Query>["subscriptionRequestSchema"] =
    Schema.Struct({
      generation: PositiveInt,
      args: kind.userArgs,
      options: Options,
      paginationId: Schema.Option(PositiveInt),
      requestId: PositiveInt,
      descriptor: PageDescriptor,
    });
  const requestSchema: PaginatedQuery<Query>["requestSchema"] = Schema.Struct({
    generation: PositiveInt,
    args: kind.userArgs,
    options: Options,
    paginationId: PositiveInt,
    requestId: PositiveInt,
    descriptor: PageDescriptor,
  });
  const pageResult = Schema.Struct({
    page: kind.page,
    isDone: Schema.Boolean,
    continueCursor: Schema.String,
    splitCursor: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    pageStatus: Schema.optionalKey(
      Schema.Union([
        Schema.Literal("SplitRecommended"),
        Schema.Literal("SplitRequired"),
        Schema.Null,
      ]),
    ),
  });
  const schema: PaginatedQuery<Query>["schema"] = Schema.TaggedUnion({
    Idle: { generation: NonNegativeInt },
    Active: {
      generation: PositiveInt,
      args: kind.userArgs,
      options: Options,
      paginationId: Schema.Option(PositiveInt),
      requestId: PositiveInt,
      current: PageDescriptor,
      prevStack: Schema.Array(PageDescriptor),
      phase,
    },
  });
  const settlement: PaginatedQuery<Query>["settlement"] = Schema.Struct({
    request: requestSchema,
    result: Schema.Result(pageResult, errorSchema),
  });

  const init: PaginatedQuery<Query>["init"] = (
    state: Idle,
    ...params: [options: Options] | [args: UserArgs<Query>, options: Options]
  ): MachineActive<Query> =>
    params.length === 2
      ? initialState(state.generation + 1, params[0], params[1])
      : // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Only refs with no user fields expose init(idle, options).
        initialState(state.generation + 1, {} as UserArgs<Query>, params[0]);

  const reinitialize: PaginatedQuery<Query>["reinitialize"] = (
    state: MachineActive<Query>,
    ...params:
      | [options?: Options | undefined]
      | [args: UserArgs<Query>, options?: Options | undefined]
  ): MachineActive<Query> => {
    const generation = state.generation + 1;
    if (params.length === 2) {
      return initialState(generation, params[0], params[1] ?? state.options);
    }
    const [single] = params;
    if (single === undefined) {
      return initialState(generation, state.args, state.options);
    }
    if (hasUserArgs) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- For refs with user fields the single argument is user args, even if those fields look like pagination options.
      return initialState(generation, single as UserArgs<Query>, state.options);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- With no user fields the public reinitialize(active, options?) overload accepts only options here.
    return initialState(generation, state.args, single as Options);
  };

  return {
    ref,
    schema,
    idle: State.Idle({ generation: 0 }),
    subscriptionRequestSchema,
    requestSchema,
    settlement,
    init,
    reinitialize,
  };
};

const descriptorEquals = (a: PageDescriptor, b: PageDescriptor): boolean =>
  a.cursor === b.cursor &&
  Option.match(a.endCursor, {
    onNone: () => Option.isNone(b.endCursor),
    onSome: (aEnd) =>
      Option.match(b.endCursor, {
        onNone: () => false,
        onSome: (bEnd) => aEnd === bEnd,
      }),
  });

/**
 * Returns the logical request currently driving the subscription.
 *
 * @internal
 */
export const getSubscriptionRequest = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): SubscriptionRequest<UserArgs_> => ({
  generation: state.generation,
  args: state.args,
  options: state.options,
  paginationId: state.paginationId,
  requestId: state.requestId,
  descriptor: state.current,
});

/**
 * Attaches the client-allocated pagination id to a logical request.
 *
 * @internal
 */
export const allocateRequest = <UserArgs_>(
  request: SubscriptionRequest<UserArgs_>,
  paginationId: number,
): Request<UserArgs_> => ({
  ...request,
  paginationId,
});

const phaseData = <Item_, Error_>(
  phase: Phase<Item_, Error_>,
): Option.Option<Page<Item_>> =>
  Match.value(phase).pipe(
    Match.withReturnType<Option.Option<Page<Item_>>>(),
    Match.tag("Refreshing", "Success", "Stale", (dataPhase) =>
      Option.some(dataPhase.data),
    ),
    Match.tag("Loading", "Failure", () => Option.none()),
    Match.exhaustive,
  );

const pendingPhase = <Item_>(
  data: Option.Option<Page<Item_>>,
  direction: Direction,
): Loading | Refreshing<Item_> =>
  Option.match(data, {
    onNone: () => Phase.Loading<Item_, never>({ direction }),
    onSome: (page) => Phase.Refreshing<Item_, never>({ data: page, direction }),
  });

/**
 * Returns an idle state with no visible page and the current generation intact.
 * The subscription closes when the Model adopts this state. Reopening advances
 * the generation so settlements from the old session are ignored.
 *
 * @category Lifecycle
 */
export const close = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Idle => State.Idle({ generation: state.generation });

/**
 * Starts a fresh session at page one with the same arguments and options. It
 * clears cursor history and the allocated pagination ID. The next phase is
 * `Refreshing` if a complete page is available to display, or `Loading`
 * otherwise.
 *
 * @category Lifecycle
 */
export const reset = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Active<Item_, UserArgs_, Error_> => ({
  ...state,
  generation: state.generation + 1,
  paginationId: Option.none(),
  requestId: 1,
  current: firstDescriptor(),
  prevStack: [],
  phase: pendingPhase(phaseData(state.phase), "Reset"),
});

/**
 * Targets the next page of a successful query and retains the current page
 * while the next loads.
 *
 * **Details**
 *
 * The machine saves the page being left as a fixed cursor range. Navigating
 * back reloads that range rather than counting `initialNumItems` from its start
 * again. This keeps adjacent ranges contiguous even for stream-paginated
 * queries without a Convex query journal.
 *
 * @category Navigation
 *
 * @returns Some refreshed state only from Success with isDone false; None while
 *   loading, after failure, or at the end. Does not mutate the input.
 *
 * @see {@link prev} reloads the previous pinned range.
 */
export const next = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Option.Option<Active<Item_, UserArgs_, Error_>> =>
  Match.value(state.phase).pipe(
    Match.withReturnType<Option.Option<Active<Item_, UserArgs_, Error_>>>(),
    Match.tag("Success", ({ data }) =>
      Match.value(data.isDone).pipe(
        Match.withReturnType<Option.Option<Active<Item_, UserArgs_, Error_>>>(),
        Match.when(true, () => Option.none()),
        Match.when(false, () => {
          const end = Option.getOrElse(
            data.descriptor.endCursor,
            () => data.continueCursor,
          );
          return Option.some({
            ...state,
            requestId: state.requestId + 1,
            current: { cursor: end, endCursor: Option.none() },
            prevStack: [
              ...state.prevStack,
              { cursor: data.descriptor.cursor, endCursor: Option.some(end) },
            ],
            phase: Phase.Refreshing<Item_, Error_>({
              data,
              direction: "Next",
            }),
          });
        }),
        Match.exhaustive,
      ),
    ),
    Match.tag("Loading", "Refreshing", "Failure", "Stale", () => Option.none()),
    Match.exhaustive,
  );

/**
 * Returns `Some` with the previous pinned range as the target, retaining the
 * current page and session ID while it loads. Returns `None` at page one or
 * when the current phase is not `Success`.
 *
 * @category Navigation
 */
export const prev = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Option.Option<Active<Item_, UserArgs_, Error_>> =>
  Match.value(state.phase).pipe(
    Match.withReturnType<Option.Option<Active<Item_, UserArgs_, Error_>>>(),
    Match.tag("Success", ({ data }) => {
      const current = state.prevStack.at(-1);
      return Match.value(current).pipe(
        Match.withReturnType<Option.Option<Active<Item_, UserArgs_, Error_>>>(),
        Match.when(undefined, () => Option.none()),
        Match.when(Match.defined, (previous) =>
          Option.some({
            ...state,
            requestId: state.requestId + 1,
            current: previous,
            prevStack: state.prevStack.slice(0, -1),
            phase: Phase.Refreshing<Item_, Error_>({
              data,
              direction: "Previous",
            }),
          }),
        ),
        Match.exhaustive,
      );
    }),
    Match.tag("Loading", "Refreshing", "Failure", "Stale", () => Option.none()),
    Match.exhaustive,
  );

/**
 * Targets the unpinned first page without replacing the session or its
 * pagination ID. Returns `None` if already targeting that range. Otherwise, it
 * clears the history and returns a loading or refreshing state, even from an
 * error phase.
 *
 * @category Navigation
 *
 * @see {@link reset} starts at page one with a new session instead.
 */
export const first = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Option.Option<Active<Item_, UserArgs_, Error_>> =>
  Match.value(
    state.prevStack.length === 0 &&
      descriptorEquals(state.current, firstDescriptor()),
  ).pipe(
    Match.withReturnType<Option.Option<Active<Item_, UserArgs_, Error_>>>(),
    Match.when(true, () => Option.none()),
    Match.when(false, () =>
      Option.some({
        ...state,
        requestId: state.requestId + 1,
        current: firstDescriptor(),
        prevStack: [],
        phase: pendingPhase(phaseData(state.phase), "First"),
      }),
    ),
    Match.exhaustive,
  );

/**
 * Whether a request still names the machine's live pagination session/page.
 *
 * @internal
 */
export const isCurrentRequest = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
  candidate: Request<UserArgs_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", (active) =>
      Match.value(active.paginationId).pipe(
        Match.tag("None", () =>
          Match.value(
            active.generation === candidate.generation &&
              active.requestId === candidate.requestId &&
              descriptorEquals(active.current, candidate.descriptor),
          ).pipe(
            Match.when(true, () => true),
            Match.when(false, () => false),
            Match.exhaustive,
          ),
        ),
        Match.tag(
          "Some",
          ({ value }) =>
            active.generation === candidate.generation &&
            value === candidate.paginationId &&
            active.requestId === candidate.requestId &&
            descriptorEquals(active.current, candidate.descriptor),
        ),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );

const pageFromResult = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
  result: PageResult<Item_>,
): Page<Item_> => ({
  descriptor: state.current,
  number: state.prevStack.length + 1,
  items: result.page,
  continueCursor: result.continueCursor,
  isDone: result.isDone,
});

const settleSuccess = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
  result: PageResult<Item_>,
): Active<Item_, UserArgs_, Error_> => {
  const splitCursor = result.splitCursor;
  const splitSignaled = Match.value(result.pageStatus).pipe(
    Match.whenOr("SplitRecommended", "SplitRequired", () => true),
    Match.whenOr(null, undefined, () => false),
    Match.exhaustive,
  );
  const shouldSplit =
    typeof splitCursor === "string" &&
    (splitSignaled || result.page.length > 2 * state.options.initialNumItems);

  return Match.value(shouldSplit).pipe(
    Match.withReturnType<Active<Item_, UserArgs_, Error_>>(),
    Match.when(true, () => {
      const deliveredPage = pageFromResult(state, result);
      const previous = Match.value(result.pageStatus).pipe(
        Match.withReturnType<Option.Option<Page<Item_>>>(),
        Match.when("SplitRequired", () => phaseData(state.phase)),
        Match.whenOr("SplitRecommended", null, undefined, () =>
          Option.some(deliveredPage),
        ),
        Match.exhaustive,
      );
      return {
        ...state,
        requestId: state.requestId + 1,
        current: {
          cursor: state.current.cursor,
          endCursor: Option.fromNullishOr(splitCursor),
        },
        phase: pendingPhase(previous, "Split"),
      };
    }),
    Match.when(false, () => {
      const previousDescriptor = state.prevStack.at(-1);
      if (
        result.page.length === 0 &&
        result.isDone &&
        previousDescriptor !== undefined
      ) {
        return {
          ...state,
          requestId: state.requestId + 1,
          current: previousDescriptor,
          prevStack: state.prevStack.slice(0, -1),
          phase: pendingPhase(phaseData(state.phase), "Previous"),
        };
      }
      return {
        ...state,
        phase: Phase.Success<Item_, Error_>({
          data: pageFromResult(state, result),
        }),
      };
    }),
    Match.exhaustive,
  );
};

const settleFailure = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
  error: Error_,
): Active<Item_, UserArgs_, Error_> => ({
  ...state,
  phase: Option.match(phaseData(state.phase), {
    onNone: () => Phase.Failure<Item_, Error_>({ error }),
    onSome: (data) => Phase.Stale<Item_, Error_>({ error, data }),
  }),
});

/**
 * Applies a subscription settlement only if it matches the active request. It
 * installs the allocated pagination ID alongside the outcome and leaves closed
 * or superseded requests unchanged. Supports `settle(state, outcome)` and
 * pipeable `settle(outcome)(state)`.
 *
 * **Details**
 *
 * A complete result becomes `Success`. An ordinary failure becomes `Stale` if a
 * page can still be displayed and `Failure` otherwise. `InvalidCursor` restarts
 * the session at page one. A split reloads a pinned range; on `SplitRequired`,
 * the machine withholds the potentially incomplete page. An empty terminal page
 * retreats if a previous range exists. These transitions do not perform network
 * I/O.
 *
 * @category Combinators
 */
export const settle: {
  <Item_, UserArgs_, Error_>(
    settlement: Settlement<Item_, UserArgs_, Error_>,
  ): (
    state: State<Item_, UserArgs_, Error_>,
  ) => State<Item_, UserArgs_, Error_>;
  <Item_, UserArgs_, Error_>(
    state: State<Item_, UserArgs_, Error_>,
    settlement: Settlement<Item_, UserArgs_, Error_>,
  ): State<Item_, UserArgs_, Error_>;
} = Function.dual(
  2,
  <Item_, UserArgs_, Error_>(
    state: State<Item_, UserArgs_, Error_>,
    settlement: Settlement<Item_, UserArgs_, Error_>,
  ): State<Item_, UserArgs_, Error_> =>
    Match.value(state).pipe(
      Match.withReturnType<State<Item_, UserArgs_, Error_>>(),
      Match.tag("Idle", () => state),
      Match.tag("Active", (active) =>
        Match.value(isCurrentRequest(active, settlement.request)).pipe(
          Match.when(false, () => active),
          Match.when(true, () => {
            const allocated = {
              ...active,
              paginationId: Option.some(settlement.request.paginationId),
            };
            return Result.match(settlement.result, {
              onSuccess: (result) => settleSuccess(allocated, result),
              onFailure: (error) =>
                Match.value(error).pipe(
                  Match.when(
                    Match.instanceOf(PaginationError.InvalidCursor),
                    () => reset(allocated),
                  ),
                  Match.orElse((other) => settleFailure(allocated, other)),
                ),
            });
          }),
          Match.exhaustive,
        ),
      ),
      Match.exhaustive,
    ),
);

/**
 * Returns the complete page available to display in `Success`, `Refreshing`, or
 * `Stale`. During navigation this can be the page being left. Returns `None` in
 * `Idle`, `Loading`, or `Failure`.
 *
 * @category Getters
 */
export const getPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<Page<Item_>> =>
  Match.value(state).pipe(
    Match.tag("Idle", () => Option.none()),
    Match.tag("Active", ({ phase }) => phaseData(phase)),
    Match.exhaustive,
  );

/**
 * Returns the items from the complete page available to display. A loaded empty
 * page yields `Some([])`; `None` means no complete page is available.
 *
 * @category Getters
 */
export const getItems = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<ReadonlyArray<Item_>> =>
  Option.map(getPage(state), (page) => page.items);

/**
 * Returns the most recent failure in `Failure` or `Stale`, and `None` in other
 * phases. Starting a refresh clears the previously visible failure.
 *
 * @category Getters
 */
export const getError = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<Error_> =>
  Match.value(state).pipe(
    Match.withReturnType<Option.Option<Error_>>(),
    Match.tag("Idle", () => Option.none()),
    Match.tag("Active", ({ phase }) =>
      Match.value(phase).pipe(
        Match.withReturnType<Option.Option<Error_>>(),
        Match.tag("Failure", "Stale", ({ error }) => Option.some(error)),
        Match.tag("Loading", "Refreshing", "Success", () => Option.none()),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );

/**
 * Returns the one-based number of the page targeted by an active subscription.
 * It can differ from the displayed page number while navigation is pending.
 *
 * @category Getters
 *
 * @see {@link getPage} returns the page currently available to display.
 */
export const targetPageNumber = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): number => state.prevStack.length + 1;

/**
 * Returns whether a complete page is available in `Success`, `Refreshing`, or
 * `Stale`.
 *
 * @category Predicates
 */
export const hasPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getPage(state));

/**
 * Returns whether the current request has a visible failure (`Failure` or
 * `Stale`).
 *
 * @category Predicates
 */
export const hasError = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getError(state));

/**
 * Returns whether an active session targets page one, including while loading
 * or after failure. Returns `false` for `Idle`; it does not test whether
 * navigation is available.
 *
 * @category Predicates
 */
export const isFirst = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", ({ prevStack }) => prevStack.length === 0),
    Match.exhaustive,
  );

/**
 * Returns whether the current phase is `Success` and its page reaches the end
 * of the query. An idle, pending, or failed session returns `false`.
 *
 * @category Predicates
 */
export const isLast = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", ({ phase }) =>
      Match.value(phase).pipe(
        Match.tag("Success", ({ data }) => data.isDone),
        Match.tag("Loading", "Refreshing", "Failure", "Stale", () => false),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );

type WithPhase<State_, Phase_> = Omit<State_, "phase"> & {
  readonly phase: Phase_;
};

/**
 * Narrows the state to the closed Idle state, whose generation is retained for
 * reopening.
 *
 * @category Guards
 */
export const isIdle = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is Idle => state._tag === "Idle";

/**
 * Narrows the state to Active with a Loading phase and no complete page to
 * display.
 *
 * @category Guards
 */
export const isLoading = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Loading> =>
  state._tag === "Active" && state.phase._tag === "Loading";

/**
 * Narrows the state to Active with a Refreshing phase retaining a complete
 * page.
 *
 * @category Guards
 */
export const isRefreshing = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Refreshing<Item_>> =>
  state._tag === "Active" && state.phase._tag === "Refreshing";

/**
 * Narrows the state to Active with the current successful page in phase.data.
 *
 * @category Guards
 */
export const isSuccess = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Success<Item_>> =>
  state._tag === "Active" && state.phase._tag === "Success";

/**
 * Narrows the state to Active with phase.error and no retained page.
 *
 * @category Guards
 */
export const isFailure = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Failure<Error_>> =>
  state._tag === "Active" && state.phase._tag === "Failure";

/**
 * Narrows the state to Active with both phase.error and the last complete
 * phase.data page.
 *
 * @category Guards
 */
export const isStale = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Stale<Item_, Error_>> =>
  state._tag === "Active" && state.phase._tag === "Stale";

/**
 * Returns whether an active request is `Loading` or `Refreshing`.
 *
 * @category Predicates
 */
export const isPending = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", ({ phase }) =>
      Match.value(phase).pipe(
        Match.tag("Loading", "Refreshing", () => true),
        Match.tag("Success", "Failure", "Stale", () => false),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );

/**
 * Returns whether `next` can advance. Only a successful page before the end of
 * the query can advance.
 *
 * @category Predicates
 */
export const canNext = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", ({ phase }) =>
      Match.value(phase).pipe(
        Match.tag("Success", ({ data }) => !data.isDone),
        Match.tag("Loading", "Refreshing", "Failure", "Stale", () => false),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );

/**
 * Returns whether `prev` can retreat. The current page must be successful and
 * have a previous pinned range.
 *
 * @category Predicates
 */
export const canPrev = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", ({ phase, prevStack }) =>
      Match.value(phase).pipe(
        Match.tag("Success", () => prevStack.length > 0),
        Match.tag("Loading", "Refreshing", "Failure", "Stale", () => false),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );

/**
 * Returns the result of the handler for the machine's current state. `onIdle`
 * receives the whole idle record; each other handler receives just the active
 * phase. Supports both `match(state, handlers)` and pipeable
 * `match(handlers)(state)`.
 *
 * @category Pattern matching
 */
export const match: {
  <Item_, Error_, A, B, C, D, E, F>(handlers: {
    /**
     * Handles the closed state and its retained generation.
     *
     * @category Pattern matching
     */
    readonly onIdle: (idle: Idle) => A;
    /**
     * Handles a pending phase with no complete page.
     *
     * @category Pattern matching
     */
    readonly onLoading: (loading: Loading) => B;
    /**
     * Handles a pending phase that retains a complete page.
     *
     * @category Pattern matching
     */
    readonly onRefreshing: (refreshing: Refreshing<Item_>) => C;
    /**
     * Handles an error with no page to display.
     *
     * @category Pattern matching
     */
    readonly onFailure: (failure: Failure<Error_>) => D;
    /**
     * Handles an error alongside the retained complete page.
     *
     * @category Pattern matching
     */
    readonly onStale: (stale: Stale<Item_, Error_>) => E;
    /**
     * Handles the current successful page.
     *
     * @category Pattern matching
     */
    readonly onSuccess: (success: Success<Item_>) => F;
  }): <UserArgs_>(
    state: State<Item_, UserArgs_, Error_>,
  ) => A | B | C | D | E | F;
  <Item_, UserArgs_, Error_, A, B, C, D, E, F>(
    state: State<Item_, UserArgs_, Error_>,
    handlers: {
      /**
       * Handles the closed state and its retained generation.
       *
       * @category Pattern matching
       */
      readonly onIdle: (idle: Idle) => A;
      /**
       * Handles a pending phase with no complete page.
       *
       * @category Pattern matching
       */
      readonly onLoading: (loading: Loading) => B;
      /**
       * Handles a pending phase that retains a complete page.
       *
       * @category Pattern matching
       */
      readonly onRefreshing: (refreshing: Refreshing<Item_>) => C;
      /**
       * Handles an error with no page to display.
       *
       * @category Pattern matching
       */
      readonly onFailure: (failure: Failure<Error_>) => D;
      /**
       * Handles an error alongside the retained complete page.
       *
       * @category Pattern matching
       */
      readonly onStale: (stale: Stale<Item_, Error_>) => E;
      /**
       * Handles the current successful page.
       *
       * @category Pattern matching
       */
      readonly onSuccess: (success: Success<Item_>) => F;
    },
  ): A | B | C | D | E | F;
} = Function.dual(
  2,
  <Item_, UserArgs_, Error_, A, B, C, D, E, F>(
    state: State<Item_, UserArgs_, Error_>,
    handlers: {
      readonly onIdle: (idle: Idle) => A;
      readonly onLoading: (loading: Loading) => B;
      readonly onRefreshing: (refreshing: Refreshing<Item_>) => C;
      readonly onFailure: (failure: Failure<Error_>) => D;
      readonly onStale: (stale: Stale<Item_, Error_>) => E;
      readonly onSuccess: (success: Success<Item_>) => F;
    },
  ): A | B | C | D | E | F => {
    if (state._tag === "Idle") {
      return handlers.onIdle(state);
    }
    const { phase } = state;
    switch (phase._tag) {
      case "Loading":
        return handlers.onLoading(phase);
      case "Refreshing":
        return handlers.onRefreshing(phase);
      case "Failure":
        return handlers.onFailure(phase);
      case "Stale":
        return handlers.onStale(phase);
      case "Success":
        return handlers.onSuccess(phase);
      default:
        return Function.absurd(phase);
    }
  },
);
