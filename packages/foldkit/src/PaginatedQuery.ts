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
 * Identifies the cursor range fetched for one page.
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
 * @category Options
 */
export interface Options {
  /**
   * Positive integer target size for a new page; pinned ranges may return more
   * or fewer items.
   *
   * @category Options
   */
  readonly initialNumItems: number;
  /**
   * Optional positive integer row-read budget forwarded to each server page
   * request.
   *
   * @category Options
   */
  readonly maximumRowsRead?: number;
  /**
   * Optional positive integer byte-read budget forwarded to each server page
   * request.
   *
   * @category Options
   */
  readonly maximumBytesRead?: number;
}

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * Validates positive integer page size and optional per-page read budgets.
 *
 * @category Schemas
 */
export const Options = Schema.Struct({
  initialNumItems: PositiveInt,
  maximumRowsRead: Schema.optionalKey(PositiveInt),
  maximumBytesRead: Schema.optionalKey(PositiveInt),
});

/**
 * Why the machine is fetching its current target. Initial starts a session;
 * Next, Previous and First navigate within one; Split reloads a narrowed range;
 * Reset starts a fresh session.
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
 * A schema-backed cursor-pagination machine. Idle closes the subscription;
 * Active carries a Phase. Use the transition functions to produce new states
 * rather than mutating these records.
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
 * The logical request from which a subscription allocates a session id.
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
 * One correlated subscription outcome. Both success and failure travel through
 * this value so `settle` can mirror `AsyncData.settle`.
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
 * Decoded item type returned in a paginated ref's page array.
 *
 * @category Models
 */
export type Item<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];

/**
 * Decoded caller arguments with the machine-managed paginationOpts removed.
 *
 * @category Options
 */
export type UserArgs<Query extends Ref.AnyConfectPublicPaginatedQuery> = Omit<
  Ref.Args<Query>,
  "paginationOpts"
>;

/**
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
 * Constructs a declared function or middleware failure envelope. Pass `{ error
 * }` with the decoded failure. Returns a tagged data value with `_tag:
 * "FunctionError"`, not an Error subclass or a thrown exception.
 *
 * @category Constructors
 */
export const FunctionError =
  Data.taggedEnum<FunctionErrorDefinition>().FunctionError;

/**
 * A declared function or middleware failure, kept distinct from client errors.
 * Its error field contains Ref.Error<Query>; this type is never if the ref
 * declares no function or middleware errors.
 *
 * @category Errors
 */
export type FunctionError<Query extends Ref.AnyConfectPublicPaginatedQuery> = [
  Ref.Error<Query>,
] extends [never]
  ? never
  : TaggedFunctionError<Ref.Error<Query>>;

/**
 * Every failure a paginated query subscription can settle with. FunctionError
 * wraps declared errors; WebSocketClientError preserves unexpected
 * backend/transport failures; Schema.SchemaError covers argument and result
 * codecs. InvalidCursor requests a session restart when passed to settle.
 *
 * @category Errors
 */
export type Error<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  | FunctionError<Query>
  | PaginationError.InvalidCursor
  | Client.WebSocketClientError
  | Schema.SchemaError;

/**
 * Core pagination failure preserving its original cause. Settlements carry it
 * explicitly, but settle handles it by restarting at page one and retaining the
 * last complete page instead of entering Failure or Stale.
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
 * The schema-and-constructor bundle returned by `make`.
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
   * Open an Idle machine at page one with a new generation and no retained
   * page. Pass `(idle, args, options)`, or `(idle, options)` for a no-args
   * query. Options require a positive integer initialNumItems and positive read
   * budgets when supplied; invalid options throw. This is a pure state
   * transition and does not perform the request until the subscription observes
   * the new state.
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
   * Replace an active session's arguments and optionally its options,
   * discarding the displayed page and returning Loading at page one with a new
   * generation. Pass `(active, args, options?)`, or `(active, options?)` for
   * no-args queries. Omitted options retain the current settings. Invalid
   * options throw as in init.
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
 * Broad bundle type for code accepting any public Confect paginated query.
 *
 * @category Models
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
 * Builds a page machine from a paginated ref.
 *
 * @category Constructors
 *
 * @example
 *   const Notes = make(refs.public.notes.paginate);
 *   const state = Notes.init(
 *     Notes.idle,
 *     { author: "ada" },
 *     { initialNumItems: 20 },
 *   );
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
                ? functionErrorSchemas[0]!
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
    argsOrOptions: UserArgs<Query> | Options,
    options?: Options,
  ): MachineActive<Query> =>
    Match.value(options).pipe(
      Match.withReturnType<MachineActive<Query>>(),
      Match.when(undefined, () =>
        initialState(
          state.generation + 1,
          {} as UserArgs<Query>,
          argsOrOptions as Options,
        ),
      ),
      Match.when(Match.defined, (definedOptions) =>
        initialState(
          state.generation + 1,
          argsOrOptions as UserArgs<Query>,
          definedOptions,
        ),
      ),
      Match.exhaustive,
    );

  const reinitialize: PaginatedQuery<Query>["reinitialize"] = (
    state: MachineActive<Query>,
    argsOrOptions?: UserArgs<Query> | Options,
    options?: Options,
  ): MachineActive<Query> =>
    Match.value(options).pipe(
      Match.withReturnType<MachineActive<Query>>(),
      Match.when(Match.defined, (definedOptions) =>
        initialState(
          state.generation + 1,
          argsOrOptions as UserArgs<Query>,
          definedOptions,
        ),
      ),
      Match.when(undefined, () =>
        Match.value(argsOrOptions).pipe(
          Match.withReturnType<MachineActive<Query>>(),
          Match.when(undefined, () =>
            initialState(state.generation + 1, state.args, state.options),
          ),
          Match.when(Match.defined, (definedArgsOrOptions) =>
            Match.value(hasUserArgs).pipe(
              Match.withReturnType<MachineActive<Query>>(),
              Match.when(true, () =>
                initialState(
                  state.generation + 1,
                  definedArgsOrOptions as UserArgs<Query>,
                  state.options,
                ),
              ),
              Match.when(false, () =>
                initialState(
                  state.generation + 1,
                  state.args,
                  definedArgsOrOptions as Options,
                ),
              ),
              Match.exhaustive,
            ),
          ),
          Match.exhaustive,
        ),
      ),
      Match.exhaustive,
    );

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
 * Close the subscription while retaining its generation tombstone. Returns Idle
 * without visible data. The subscription closes when it observes that state;
 * later init advances the generation so old outcomes are ignored.
 *
 * @category Lifecycle
 */
export const close = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Idle => State.Idle({ generation: state.generation });

/**
 * Start a fresh pagination session at page one while retaining visible data.
 * Clears cursor history and the allocated pagination id, retaining args and
 * options. Returns Refreshing when a complete page exists, otherwise Loading.
 * The subscription performs the new request after the Model adopts this state.
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
 * Navigate to the next page, retaining the current page while it loads.
 *
 * The page being left is pushed onto the stack _pinned_ to the range it
 * displayed—its cursor to its continuation cursor—so `prev` reloads exactly
 * that range rather than the first `initialNumItems` documents after its
 * cursor, however the data has moved meanwhile. Convex's own pagination keeps
 * that range in its query journal; stream-paginated queries have no journal, so
 * the pin is what keeps consecutive pages gap-free and duplicate-free for
 * them.
 *
 * @category Navigation
 *
 * @returns Some refreshed state only from Success with isDone false; None while
 *   loading, after failure, or at the end. Does not mutate the input.
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
 * Navigate to the previous page, retaining the current page while it loads.
 * Returns Some refreshed state only from Success with a previous pinned range;
 * returns None at page one or in any loading/error phase. Keeps the session
 * id.
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
 * Navigate to page one without invalidating the current pagination session.
 * Returns None only when already targeting the unpinned first range. Otherwise
 * clears history and returns a new Loading/Refreshing state, including from an
 * error phase. Unlike reset, it preserves the generation and pagination id.
 *
 * @category Navigation
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
  const shouldRetreat =
    result.page.length === 0 && result.isDone && state.prevStack.length > 0;

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
    Match.when(false, () =>
      Match.value(shouldRetreat).pipe(
        Match.withReturnType<Active<Item_, UserArgs_, Error_>>(),
        Match.when(true, () => ({
          ...state,
          requestId: state.requestId + 1,
          current: state.prevStack[state.prevStack.length - 1],
          prevStack: state.prevStack.slice(0, -1),
          phase: pendingPhase(phaseData(state.phase), "Previous"),
        })),
        Match.when(false, () => ({
          ...state,
          phase: Phase.Success<Item_, Error_>({
            data: pageFromResult(state, result),
          }),
        })),
        Match.exhaustive,
      ),
    ),
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
 * Fold a correlated `Result` into the machine. Like `AsyncData.settle`, a
 * success becomes `Success`; a failure becomes `Stale` when a page is held,
 * otherwise `Failure`. Outcomes from superseded requests and outcomes that
 * arrive after the subscription closed are ignored. Installs the request's
 * allocated pagination id atomically with its outcome. InvalidCursor starts a
 * fresh session; split signals reload a pinned range without displaying an
 * incomplete page, and an empty terminal page retreats when a previous range
 * exists. The transition never performs network I/O. Supports `settle(state,
 * outcome)` and pipeable `settle(outcome)(state)`.
 *
 * @category Settlement
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
 * The complete page currently available to render. Returns Some for Success,
 * Refreshing and Stale, including the retained old page during navigation;
 * returns None for Idle, Loading and Failure.
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
 * The items currently available to render. Maps getPage to its items. None
 * means no complete page, not an empty page; a successfully loaded empty page
 * produces Some([]).
 *
 * @category Getters
 */
export const getItems = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<ReadonlyArray<Item_>> =>
  Option.map(getPage(state), (page) => page.items);

/**
 * The error from the most recent failed request, if any. Returns Some only in
 * Failure or Stale. Idle and pending/successful phases return None; starting a
 * new refresh clears the previously visible failure.
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
 * The 1-indexed page number currently targeted by the subscription. Requires
 * Active state. It can differ from getPage(state).number while a retained page
 * is displayed during navigation.
 *
 * @category Getters
 */
export const targetPageNumber = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): number => state.prevStack.length + 1;

/**
 * True for Success, Refreshing or Stale, when getPage returns a complete page.
 *
 * @category Predicates
 */
export const hasPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getPage(state));

/**
 * True for Failure or Stale, when getError returns the current request's
 * failure.
 *
 * @category Predicates
 */
export const hasError = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getError(state));

/**
 * Whether an Active session targets page one (its history is empty), including
 * loading and error phases. Returns false for Idle; this is not a navigation
 * guard.
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
 * True only for Success whose page has isDone true; false while pending, stale
 * or idle.
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
 * Narrow to the closed Idle state, whose generation is retained for reopening.
 *
 * @category Refinements
 */
export const isIdle = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is Idle => state._tag === "Idle";

/**
 * Narrow to Active with a Loading phase and no complete page to display.
 *
 * @category Refinements
 */
export const isLoading = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Loading> =>
  state._tag === "Active" && state.phase._tag === "Loading";

/**
 * Narrow to Active with a Refreshing phase retaining a complete page.
 *
 * @category Refinements
 */
export const isRefreshing = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Refreshing<Item_>> =>
  state._tag === "Active" && state.phase._tag === "Refreshing";

/**
 * Narrow to Active with the current successful page in phase.data.
 *
 * @category Refinements
 */
export const isSuccess = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Success<Item_>> =>
  state._tag === "Active" && state.phase._tag === "Success";

/**
 * Narrow to Active with phase.error and no retained page.
 *
 * @category Refinements
 */
export const isFailure = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Failure<Error_>> =>
  state._tag === "Active" && state.phase._tag === "Failure";

/**
 * Narrow to Active with both phase.error and the last complete phase.data page.
 *
 * @category Refinements
 */
export const isStale = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Stale<Item_, Error_>> =>
  state._tag === "Active" && state.phase._tag === "Stale";

/**
 * True while an Active request is Loading or Refreshing; false for all settled
 * phases and Idle.
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
 * True only when next can advance: Active, Success, and not at the query's end.
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
 * True only when prev can advance: Active, Success, and a previous pinned range
 * exists.
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
 * Pattern-match exhaustively on the machine's AsyncData-style state. onIdle
 * receives the whole Idle record; other handlers receive the phase, not the
 * outer Active record. Supports `match(state, handlers)` and pipeable
 * `match(handlers)(state)` and returns the selected handler's value unchanged.
 *
 * @category Pattern matching
 */
export const match: {
  <Item_, Error_, A, B, C, D, E, F>(handlers: {
    /**
     * Handle the closed state and its retained generation.
     *
     * @category Pattern matching
     */
    readonly onIdle: (idle: Idle) => A;
    /**
     * Handle a pending phase with no complete page.
     *
     * @category Pattern matching
     */
    readonly onLoading: (loading: Loading) => B;
    /**
     * Handle a pending phase that retains a complete page.
     *
     * @category Pattern matching
     */
    readonly onRefreshing: (refreshing: Refreshing<Item_>) => C;
    /**
     * Handle an error with no page to display.
     *
     * @category Pattern matching
     */
    readonly onFailure: (failure: Failure<Error_>) => D;
    /**
     * Handle an error alongside the retained complete page.
     *
     * @category Pattern matching
     */
    readonly onStale: (stale: Stale<Item_, Error_>) => E;
    /**
     * Handle the current successful page.
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
       * Handle the closed state and its retained generation.
       *
       * @category Pattern matching
       */
      readonly onIdle: (idle: Idle) => A;
      /**
       * Handle a pending phase with no complete page.
       *
       * @category Pattern matching
       */
      readonly onLoading: (loading: Loading) => B;
      /**
       * Handle a pending phase that retains a complete page.
       *
       * @category Pattern matching
       */
      readonly onRefreshing: (refreshing: Refreshing<Item_>) => C;
      /**
       * Handle an error with no page to display.
       *
       * @category Pattern matching
       */
      readonly onFailure: (failure: Failure<Error_>) => D;
      /**
       * Handle an error alongside the retained complete page.
       *
       * @category Pattern matching
       */
      readonly onStale: (stale: Stale<Item_, Error_>) => E;
      /**
       * Handle the current successful page.
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
  ): A | B | C | D | E | F =>
    Match.value(state).pipe(
      Match.tag("Idle", handlers.onIdle),
      Match.tag("Active", ({ phase }) =>
        Match.value(phase).pipe(
          Match.tag("Loading", handlers.onLoading),
          Match.tag("Refreshing", handlers.onRefreshing),
          Match.tag("Failure", handlers.onFailure),
          Match.tag("Stale", handlers.onStale),
          Match.tag("Success", handlers.onSuccess),
          Match.exhaustive,
        ),
      ),
      Match.exhaustive,
    ) as A | B | C | D | E | F,
);
