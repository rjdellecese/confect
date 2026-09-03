import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as PaginationError from "@confect/core/PaginationError";
import * as Ref from "@confect/core/Ref";
import * as Data from "effect/Data";
import * as Function from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Client from "./Client";

/** Identifies the cursor range fetched for one page. */
export interface PageDescriptor {
  readonly cursor: string | null;
  readonly endCursor: Option.Option<string>;
}

export const PageDescriptor = Schema.Struct({
  cursor: Schema.Union([Schema.String, Schema.Null]),
  endCursor: Schema.Option(Schema.String),
});

/** Options that remain fixed for one pagination session. */
export interface Options {
  readonly initialNumItems: number;
  readonly maximumRowsRead?: number;
  readonly maximumBytesRead?: number;
}

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const Options = Schema.Struct({
  initialNumItems: PositiveInt,
  maximumRowsRead: Schema.optionalKey(PositiveInt),
  maximumBytesRead: Schema.optionalKey(PositiveInt),
});

/** Why the machine is fetching its current target. */
export type Direction =
  | "Initial"
  | "Next"
  | "Previous"
  | "First"
  | "Split"
  | "Reset";

/** A complete page that can remain on screen while another page is fetched. */
export interface Page<Item_> {
  readonly descriptor: PageDescriptor;
  readonly number: number;
  readonly items: ReadonlyArray<Item_>;
  readonly continueCursor: string;
  readonly isDone: boolean;
}

export type Loading = Data.TaggedEnum<{
  Loading: { readonly direction: Direction };
}>;

export type Refreshing<Item_> = Data.TaggedEnum<{
  Refreshing: { readonly data: Page<Item_>; readonly direction: Direction };
}>;

export type Success<Item_> = Data.TaggedEnum<{
  Success: { readonly data: Page<Item_> };
}>;

export type Failure<Error_> = Data.TaggedEnum<{
  Failure: { readonly error: Error_ };
}>;

export type Stale<Item_, Error_> = Data.TaggedEnum<{
  Stale: { readonly data: Page<Item_>; readonly error: Error_ };
}>;

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

/** A closed machine that retains its generation for stale-result rejection. */
export type Idle = Data.TaggedEnum<{
  Idle: { readonly generation: number };
}>;

/** A live cursor-pagination session. */
export type Active<Item_, UserArgs_, Error_> = Data.TaggedEnum<{
  Active: {
    readonly generation: number;
    readonly args: UserArgs_;
    readonly options: Options;
    readonly paginationId: Option.Option<number>;
    readonly requestId: number;
    readonly current: PageDescriptor;
    readonly prevStack: ReadonlyArray<PageDescriptor>;
    readonly phase: Phase<Item_, Error_>;
  };
}>;

/** A schema-backed cursor-pagination machine. */
export type State<Item_, UserArgs_, Error_> =
  | Idle
  | Active<Item_, UserArgs_, Error_>;

interface StateDefinition extends Data.TaggedEnum.WithGenerics<3> {
  readonly taggedEnum: State<this["A"], this["B"], this["C"]>;
}

const State = Data.taggedEnum<StateDefinition>();

/** The logical request from which a subscription allocates a session id. */
export interface SubscriptionRequest<UserArgs_> {
  readonly generation: number;
  readonly args: UserArgs_;
  readonly options: Options;
  readonly paginationId: Option.Option<number>;
  readonly requestId: number;
  readonly descriptor: PageDescriptor;
}

/** The complete identity and arguments of a subscribed page request. */
export interface Request<UserArgs_> {
  readonly generation: number;
  readonly args: UserArgs_;
  readonly options: Options;
  readonly paginationId: number;
  readonly requestId: number;
  readonly descriptor: PageDescriptor;
}

/** The successful payload returned by a Convex paginated query. */
export interface PageResult<Item_> {
  readonly page: ReadonlyArray<Item_>;
  readonly isDone: boolean;
  readonly continueCursor: string;
  readonly splitCursor?: string | null;
  readonly pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

/**
 * One correlated subscription outcome. Both success and failure travel
 * through this value so `settle` can mirror `AsyncData.settle`.
 */
export interface Settlement<Item_, UserArgs_, Error_> {
  readonly request: Request<UserArgs_>;
  readonly result: Result.Result<PageResult<Item_>, Error_>;
}

export type Item<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];

export type UserArgs<Query extends Ref.AnyConfectPublicPaginatedQuery> = Omit<
  Ref.Args<Query>,
  "paginationOpts"
>;

type TaggedFunctionError<Error_> = Data.TaggedEnum<{
  FunctionError: { readonly error: Error_ };
}>;

interface FunctionErrorDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: TaggedFunctionError<this["A"]>;
}

/** Constructs a declared function or middleware failure envelope. */
export const FunctionError =
  Data.taggedEnum<FunctionErrorDefinition>().FunctionError;

/** A declared function or middleware failure, kept distinct from client errors. */
export type FunctionError<Query extends Ref.AnyConfectPublicPaginatedQuery> = [
  Ref.Error<Query>,
] extends [never]
  ? never
  : TaggedFunctionError<Ref.Error<Query>>;

/** Every failure a paginated query subscription can settle with. */
export type Error<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  | FunctionError<Query>
  | PaginationError.InvalidCursor
  | Client.WebSocketClientError
  | Schema.SchemaError;

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

/** The schema-and-constructor bundle returned by `make`. */
export interface PaginatedQuery<
  Query extends Ref.AnyConfectPublicPaginatedQuery,
> {
  readonly ref: Query;
  readonly schema: Schema.Codec<MachineState<Query>, unknown>;
  readonly idle: Idle;
  readonly subscriptionRequestSchema: Schema.Codec<
    SubscriptionRequest<UserArgs<Query>>,
    unknown
  >;
  readonly requestSchema: Schema.Codec<Request<UserArgs<Query>>, unknown>;
  readonly settlement: Schema.Codec<
    Settlement<Item<Query>, UserArgs<Query>, Error<Query>>,
    unknown
  >;
  readonly init: keyof UserArgs<Query> extends never
    ? (state: Idle, options: Options) => MachineActive<Query>
    : (
        state: Idle,
        args: UserArgs<Query>,
        options: Options,
      ) => MachineActive<Query>;
  readonly reinitialize: keyof UserArgs<Query> extends never
    ? (state: MachineActive<Query>, options?: Options) => MachineActive<Query>
    : (
        state: MachineActive<Query>,
        args: UserArgs<Query>,
        options?: Options,
      ) => MachineActive<Query>;
}

export type Any = PaginatedQuery<Ref.AnyConfectPublicPaginatedQuery>;

const firstDescriptor = (): PageDescriptor => ({
  cursor: null,
  endCursor: Option.none(),
});

const decodeOptions = Schema.decodeUnknownSync(Options);

const initialState = <Item_, UserArgs_, Error_>(
  generation: number,
  args: UserArgs_,
  options: Options,
): Active<Item_, UserArgs_, Error_> =>
  State.Active<Item_, UserArgs_, Error_>({
    generation,
    args,
    options: decodeOptions(options),
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

/** Builds a page machine from a paginated ref. */
export const make = <Query extends Ref.AnyConfectPublicPaginatedQuery>(
  ref: Query,
): PaginatedQuery<Query> => {
  const kind = paginatedKindOrThrow(ref);
  const hasUserArgs = globalThis.Object.keys(kind.userArgs.fields).length > 0;
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

/** Returns the logical request currently driving the subscription. */
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

/** Attaches the client-allocated pagination id to a logical request. */
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

/** Close the subscription while retaining its generation tombstone. */
export const close = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): Idle => State.Idle({ generation: state.generation });

/** Start a fresh pagination session at page one while retaining visible data. */
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
 * The page being left is pushed onto the stack *pinned* to the range it
 * displayed — its cursor to its continuation cursor — so `prev` reloads
 * exactly that range rather than the first `initialNumItems` documents
 * after its cursor, however the data has moved meanwhile. Convex's own
 * pagination keeps that range in its query journal; stream-paginated
 * queries have no journal, so the pin is what keeps consecutive pages
 * gap-free and duplicate-free for them.
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

/** Navigate to the previous page, retaining the current page while it loads. */
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

/** Navigate to page one without invalidating the current pagination session. */
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

/** Whether a request still names the machine's live pagination session/page. */
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
 * arrive after the subscription closed are ignored.
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

/** The complete page currently available to render. */
export const getPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<Page<Item_>> =>
  Match.value(state).pipe(
    Match.tag("Idle", () => Option.none()),
    Match.tag("Active", ({ phase }) => phaseData(phase)),
    Match.exhaustive,
  );

/** The items currently available to render. */
export const getItems = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<ReadonlyArray<Item_>> =>
  Option.map(getPage(state), (page) => page.items);

/** The error from the most recent failed request, if any. */
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

/** The 1-indexed page number currently targeted by the subscription. */
export const targetPageNumber = <Item_, UserArgs_, Error_>(
  state: Active<Item_, UserArgs_, Error_>,
): number => state.prevStack.length + 1;

export const hasPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getPage(state));

export const hasError = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getError(state));

export const isFirst = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state).pipe(
    Match.tag("Idle", () => false),
    Match.tag("Active", ({ prevStack }) => prevStack.length === 0),
    Match.exhaustive,
  );

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

export const isIdle = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is Idle => state._tag === "Idle";

export const isLoading = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Loading> =>
  state._tag === "Active" && state.phase._tag === "Loading";

export const isRefreshing = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Refreshing<Item_>> =>
  state._tag === "Active" && state.phase._tag === "Refreshing";

export const isSuccess = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Success<Item_>> =>
  state._tag === "Active" && state.phase._tag === "Success";

export const isFailure = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Failure<Error_>> =>
  state._tag === "Active" && state.phase._tag === "Failure";

export const isStale = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<Active<Item_, UserArgs_, Error_>, Stale<Item_, Error_>> =>
  state._tag === "Active" && state.phase._tag === "Stale";

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

/** Pattern-match exhaustively on the machine's AsyncData-style state. */
export const match: {
  <Item_, Error_, A, B, C, D, E, F>(handlers: {
    readonly onIdle: (idle: Idle) => A;
    readonly onLoading: (loading: Loading) => B;
    readonly onRefreshing: (refreshing: Refreshing<Item_>) => C;
    readonly onFailure: (failure: Failure<Error_>) => D;
    readonly onStale: (stale: Stale<Item_, Error_>) => E;
    readonly onSuccess: (success: Success<Item_>) => F;
  }): <UserArgs_>(
    state: State<Item_, UserArgs_, Error_>,
  ) => A | B | C | D | E | F;
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
