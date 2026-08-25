import * as Ref from "@confect/core/Ref";
import { WebSocketClientError } from "@confect/js/WebSocketClient";
import * as Function from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

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
  | "Retry"
  | "Reset";

/** A complete page that can remain on screen while another page is fetched. */
export interface Page<Item_> {
  readonly descriptor: PageDescriptor;
  readonly number: number;
  readonly items: ReadonlyArray<Item_>;
  readonly continueCursor: string;
  readonly isDone: boolean;
}

export interface Loading {
  readonly _tag: "Loading";
  readonly direction: Direction;
}

export interface Refreshing<Item_> {
  readonly _tag: "Refreshing";
  readonly data: Page<Item_>;
  readonly direction: Direction;
}

export interface Success<Item_> {
  readonly _tag: "Success";
  readonly data: Page<Item_>;
}

export interface Failure<Error_> {
  readonly _tag: "Failure";
  readonly error: Error_;
}

export interface Stale<Item_, Error_> {
  readonly _tag: "Stale";
  readonly data: Page<Item_>;
  readonly error: Error_;
}

/**
 * The five `AsyncData` states applicable after a paginated query is opened.
 * `Idle` is represented by the absence of the whole machine from the Model.
 */
export type Phase<Item_, Error_> =
  | Loading
  | Refreshing<Item_>
  | Success<Item_>
  | Failure<Error_>
  | Stale<Item_, Error_>;

/** A serializable cursor-pagination machine. */
export interface State<Item_, UserArgs_, Error_> {
  readonly args: UserArgs_;
  readonly options: Options;
  readonly paginationId: number;
  readonly requestId: number;
  readonly current: PageDescriptor;
  readonly prevStack: ReadonlyArray<PageDescriptor>;
  readonly phase: Phase<Item_, Error_>;
}

/** The complete identity of a live page request. */
export interface Request<UserArgs_> {
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

type MachineState<
  Query extends Ref.AnyConfectPublicPaginatedQuery,
  Error_,
> = State<Item<Query>, UserArgs<Query>, Error_>;

/** The schema-and-constructor bundle returned by `make`. */
export interface PaginatedQuery<
  Query extends Ref.AnyConfectPublicPaginatedQuery,
  Error_,
> {
  readonly ref: Query;
  readonly schema: Schema.Codec<MachineState<Query, Error_>, unknown>;
  readonly requestSchema: Schema.Codec<Request<UserArgs<Query>>, unknown>;
  readonly settlement: Schema.Codec<
    Settlement<Item<Query>, UserArgs<Query>, Error_>,
    unknown
  >;
  readonly init: keyof UserArgs<Query> extends never
    ? (options: Options) => MachineState<Query, Error_>
    : (args: UserArgs<Query>, options: Options) => MachineState<Query, Error_>;
  readonly reinitialize: keyof UserArgs<Query> extends never
    ? (
        state: MachineState<Query, Error_>,
        options?: Options,
      ) => MachineState<Query, Error_>
    : (
        state: MachineState<Query, Error_>,
        args: UserArgs<Query>,
        options?: Options,
      ) => MachineState<Query, Error_>;
}

export type Any = PaginatedQuery<Ref.AnyConfectPublicPaginatedQuery, any>;

const firstDescriptor = (): PageDescriptor => ({
  cursor: null,
  endCursor: Option.none(),
});

let paginationId = 0;
const nextPaginationId = (): number => ++paginationId;

const decodeOptions = Schema.decodeUnknownSync(Options);

const initialState = <Item_, UserArgs_, Error_>(
  args: UserArgs_,
  options: Options,
  requestId = 1,
): State<Item_, UserArgs_, Error_> => ({
  args,
  options: decodeOptions(options),
  paginationId: nextPaginationId(),
  requestId,
  current: firstDescriptor(),
  prevStack: [],
  phase: { _tag: "Loading", direction: "Initial" },
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

/**
 * Builds a page machine from a paginated ref and the serializable application
 * error used in the Model.
 */
export const make = <Query extends Ref.AnyConfectPublicPaginatedQuery, Error_>(
  ref: Query,
  errorSchema: Schema.Codec<Error_, any>,
): PaginatedQuery<Query, Error_> => {
  const kind = paginatedKindOrThrow(ref);
  const hasUserArgs = globalThis.Object.keys(kind.userArgs.fields).length > 0;
  const directions = Schema.Literals([
    "Initial",
    "Next",
    "Previous",
    "First",
    "Split",
    "Retry",
    "Reset",
  ]);
  const page = Schema.Struct({
    descriptor: PageDescriptor,
    number: PositiveInt,
    items: kind.page,
    continueCursor: Schema.String,
    isDone: Schema.Boolean,
  });
  const phase = Schema.Union([
    Schema.TaggedStruct("Loading", { direction: directions }),
    Schema.TaggedStruct("Refreshing", { data: page, direction: directions }),
    Schema.TaggedStruct("Success", { data: page }),
    Schema.TaggedStruct("Failure", { error: errorSchema }),
    Schema.TaggedStruct("Stale", { data: page, error: errorSchema }),
  ]);
  const requestSchema = Schema.Struct({
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
  const schema: PaginatedQuery<Query, Error_>["schema"] = Schema.Struct({
    args: kind.userArgs,
    options: Options,
    paginationId: PositiveInt,
    requestId: PositiveInt,
    current: PageDescriptor,
    prevStack: Schema.Array(PageDescriptor),
    phase,
  });
  const settlement: PaginatedQuery<Query, Error_>["settlement"] = Schema.Struct(
    {
      request: requestSchema,
      result: Schema.Result(pageResult, errorSchema),
    },
  );

  const init: PaginatedQuery<Query, Error_>["init"] = (
    argsOrOptions: UserArgs<Query> | Options,
    options?: Options,
  ): MachineState<Query, Error_> =>
    Match.value(options).pipe(
      Match.withReturnType<MachineState<Query, Error_>>(),
      Match.when(undefined, () =>
        initialState({} as UserArgs<Query>, argsOrOptions as Options),
      ),
      Match.when(Match.defined, (definedOptions) =>
        initialState(argsOrOptions as UserArgs<Query>, definedOptions),
      ),
      Match.exhaustive,
    );

  const reinitialize: PaginatedQuery<Query, Error_>["reinitialize"] = (
    state: MachineState<Query, Error_>,
    argsOrOptions?: UserArgs<Query> | Options,
    options?: Options,
  ): MachineState<Query, Error_> =>
    Match.value(options).pipe(
      Match.withReturnType<MachineState<Query, Error_>>(),
      Match.when(Match.defined, (definedOptions) =>
        initialState(
          argsOrOptions as UserArgs<Query>,
          definedOptions,
          state.requestId + 1,
        ),
      ),
      Match.when(undefined, () =>
        Match.value(argsOrOptions).pipe(
          Match.withReturnType<MachineState<Query, Error_>>(),
          Match.when(undefined, () =>
            initialState(state.args, state.options, state.requestId + 1),
          ),
          Match.when(Match.defined, (definedArgsOrOptions) =>
            Match.value(hasUserArgs).pipe(
              Match.withReturnType<MachineState<Query, Error_>>(),
              Match.when(true, () =>
                initialState(
                  definedArgsOrOptions as UserArgs<Query>,
                  state.options,
                  state.requestId + 1,
                ),
              ),
              Match.when(false, () =>
                initialState(
                  state.args,
                  definedArgsOrOptions as Options,
                  state.requestId + 1,
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

  return { ref, schema, requestSchema, settlement, init, reinitialize };
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

/** Returns the identity and arguments of the machine's current request. */
export const getRequest = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Request<UserArgs_> => ({
  args: state.args,
  options: state.options,
  paginationId: state.paginationId,
  requestId: state.requestId,
  descriptor: state.current,
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
    onNone: () => ({ _tag: "Loading", direction }),
    onSome: (page) => ({ _tag: "Refreshing", data: page, direction }),
  });

/** Navigate to the next page, retaining the current page while it loads. */
export const next = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<State<Item_, UserArgs_, Error_>> =>
  Match.value(state.phase).pipe(
    Match.withReturnType<Option.Option<State<Item_, UserArgs_, Error_>>>(),
    Match.tag("Success", ({ data }) =>
      Match.value(data.isDone).pipe(
        Match.withReturnType<Option.Option<State<Item_, UserArgs_, Error_>>>(),
        Match.when(true, () => Option.none()),
        Match.when(false, () =>
          Option.some({
            ...state,
            requestId: state.requestId + 1,
            current: {
              cursor: Option.getOrElse(
                data.descriptor.endCursor,
                () => data.continueCursor,
              ),
              endCursor: Option.none(),
            },
            prevStack: [...state.prevStack, data.descriptor],
            phase: { _tag: "Refreshing", data, direction: "Next" },
          }),
        ),
        Match.exhaustive,
      ),
    ),
    Match.tag("Loading", "Refreshing", "Failure", "Stale", () => Option.none()),
    Match.exhaustive,
  );

/** Navigate to the previous page, retaining the current page while it loads. */
export const prev = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<State<Item_, UserArgs_, Error_>> =>
  Match.value(state.phase).pipe(
    Match.withReturnType<Option.Option<State<Item_, UserArgs_, Error_>>>(),
    Match.tag("Success", ({ data }) => {
      const current = state.prevStack.at(-1);
      return Match.value(current).pipe(
        Match.withReturnType<Option.Option<State<Item_, UserArgs_, Error_>>>(),
        Match.when(undefined, () => Option.none()),
        Match.when(Match.defined, (previous) =>
          Option.some({
            ...state,
            requestId: state.requestId + 1,
            current: previous,
            prevStack: state.prevStack.slice(0, -1),
            phase: { _tag: "Refreshing", data, direction: "Previous" },
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
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<State<Item_, UserArgs_, Error_>> =>
  Match.value(
    state.prevStack.length === 0 &&
      descriptorEquals(state.current, firstDescriptor()),
  ).pipe(
    Match.withReturnType<Option.Option<State<Item_, UserArgs_, Error_>>>(),
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

/** Reopen a failed request at the same page with a fresh pagination id. */
export const retry = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<State<Item_, UserArgs_, Error_>> =>
  Match.value(state.phase).pipe(
    Match.withReturnType<Option.Option<State<Item_, UserArgs_, Error_>>>(),
    Match.tag("Failure", () =>
      Option.some({
        ...state,
        paginationId: nextPaginationId(),
        requestId: state.requestId + 1,
        phase: { _tag: "Loading", direction: "Retry" },
      }),
    ),
    Match.tag("Stale", ({ data }) =>
      Option.some({
        ...state,
        paginationId: nextPaginationId(),
        requestId: state.requestId + 1,
        phase: { _tag: "Refreshing", data, direction: "Retry" },
      }),
    ),
    Match.tag("Loading", "Refreshing", "Success", () => Option.none()),
    Match.exhaustive,
  );

/**
 * Start a fresh pagination session at page one. Unlike `first`, this replaces
 * Convex's pagination id, so it is the recovery for invalid or expired
 * cursors. Any displayed page remains visible until page one settles.
 */
export const reset = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): State<Item_, UserArgs_, Error_> => ({
  ...state,
  paginationId: nextPaginationId(),
  requestId: state.requestId + 1,
  current: firstDescriptor(),
  prevStack: [],
  phase: pendingPhase(phaseData(state.phase), "Reset"),
});

/** Whether a request still names the machine's live pagination session/page. */
export const isCurrentRequest = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
  candidate: Request<UserArgs_>,
): boolean =>
  Match.value(state.phase).pipe(
    Match.tag("Failure", "Stale", () => false),
    Match.tag(
      "Loading",
      "Refreshing",
      "Success",
      () =>
        state.paginationId === candidate.paginationId &&
        state.requestId === candidate.requestId &&
        descriptorEquals(state.current, candidate.descriptor),
    ),
    Match.exhaustive,
  );

const pageFromResult = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
  result: PageResult<Item_>,
): Page<Item_> => ({
  descriptor: state.current,
  number: state.prevStack.length + 1,
  items: result.page,
  continueCursor: result.continueCursor,
  isDone: result.isDone,
});

const settleSuccess = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
  result: PageResult<Item_>,
): State<Item_, UserArgs_, Error_> => {
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
    Match.withReturnType<State<Item_, UserArgs_, Error_>>(),
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
        Match.withReturnType<State<Item_, UserArgs_, Error_>>(),
        Match.when(true, () => ({
          ...state,
          requestId: state.requestId + 1,
          current: state.prevStack[state.prevStack.length - 1],
          prevStack: state.prevStack.slice(0, -1),
          phase: pendingPhase(phaseData(state.phase), "Previous"),
        })),
        Match.when(false, () => ({
          ...state,
          phase: { _tag: "Success", data: pageFromResult(state, result) },
        })),
        Match.exhaustive,
      ),
    ),
    Match.exhaustive,
  );
};

const settleFailure = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
  error: Error_,
): State<Item_, UserArgs_, Error_> => ({
  ...state,
  phase: Option.match(phaseData(state.phase), {
    onNone: () => ({ _tag: "Failure", error }),
    onSome: (data) => ({ _tag: "Stale", error, data }),
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
    Match.value(isCurrentRequest(state, settlement.request)).pipe(
      Match.withReturnType<State<Item_, UserArgs_, Error_>>(),
      Match.when(false, () => state),
      Match.when(true, () =>
        Result.match(settlement.result, {
          onSuccess: (result) => settleSuccess(state, result),
          onFailure: (error) => settleFailure(state, error),
        }),
      ),
      Match.exhaustive,
    ),
);

/** The complete page currently available to render. */
export const getPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<Page<Item_>> => phaseData(state.phase);

/** The items currently available to render. */
export const getItems = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<ReadonlyArray<Item_>> =>
  Option.map(getPage(state), (page) => page.items);

/** The error from the most recent failed request, if any. */
export const getError = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): Option.Option<Error_> =>
  Match.value(state.phase).pipe(
    Match.withReturnType<Option.Option<Error_>>(),
    Match.tag("Failure", "Stale", ({ error }) => Option.some(error)),
    Match.tag("Loading", "Refreshing", "Success", () => Option.none()),
    Match.exhaustive,
  );

/** The 1-indexed page number currently targeted by the subscription. */
export const targetPageNumber = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): number => state.prevStack.length + 1;

export const hasPage = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getPage(state));

export const hasError = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => Option.isSome(getError(state));

export const isFirst = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean => state.prevStack.length === 0;

export const isLast = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state.phase).pipe(
    Match.tag("Success", ({ data }) => data.isDone),
    Match.tag("Loading", "Refreshing", "Failure", "Stale", () => false),
    Match.exhaustive,
  );

type WithPhase<State_, Phase_> = Omit<State_, "phase"> & {
  readonly phase: Phase_;
};

export const isLoading = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<State<Item_, UserArgs_, Error_>, Loading> =>
  state.phase._tag === "Loading";

export const isRefreshing = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<State<Item_, UserArgs_, Error_>, Refreshing<Item_>> =>
  state.phase._tag === "Refreshing";

export const isSuccess = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<State<Item_, UserArgs_, Error_>, Success<Item_>> =>
  state.phase._tag === "Success";

export const isFailure = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<State<Item_, UserArgs_, Error_>, Failure<Error_>> =>
  state.phase._tag === "Failure";

export const isStale = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): state is WithPhase<State<Item_, UserArgs_, Error_>, Stale<Item_, Error_>> =>
  state.phase._tag === "Stale";

export const isPending = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state.phase).pipe(
    Match.tag("Loading", "Refreshing", () => true),
    Match.tag("Success", "Failure", "Stale", () => false),
    Match.exhaustive,
  );

export const canNext = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state.phase).pipe(
    Match.tag("Success", ({ data }) => !data.isDone),
    Match.tag("Loading", "Refreshing", "Failure", "Stale", () => false),
    Match.exhaustive,
  );

export const canPrev = <Item_, UserArgs_, Error_>(
  state: State<Item_, UserArgs_, Error_>,
): boolean =>
  Match.value(state.phase).pipe(
    Match.tag("Success", () => state.prevStack.length > 0),
    Match.tag("Loading", "Refreshing", "Failure", "Stale", () => false),
    Match.exhaustive,
  );

/** Pattern-match exhaustively on the machine's AsyncData-style phase. */
export const match: {
  <Item_, Error_, A, B, C, D, E>(handlers: {
    readonly onLoading: (loading: Loading) => A;
    readonly onRefreshing: (refreshing: Refreshing<Item_>) => B;
    readonly onFailure: (failure: Failure<Error_>) => C;
    readonly onStale: (stale: Stale<Item_, Error_>) => D;
    readonly onSuccess: (success: Success<Item_>) => E;
  }): <UserArgs_>(state: State<Item_, UserArgs_, Error_>) => A | B | C | D | E;
  <Item_, UserArgs_, Error_, A, B, C, D, E>(
    state: State<Item_, UserArgs_, Error_>,
    handlers: {
      readonly onLoading: (loading: Loading) => A;
      readonly onRefreshing: (refreshing: Refreshing<Item_>) => B;
      readonly onFailure: (failure: Failure<Error_>) => C;
      readonly onStale: (stale: Stale<Item_, Error_>) => D;
      readonly onSuccess: (success: Success<Item_>) => E;
    },
  ): A | B | C | D | E;
} = Function.dual(
  2,
  <Item_, UserArgs_, Error_, A, B, C, D, E>(
    state: State<Item_, UserArgs_, Error_>,
    handlers: {
      readonly onLoading: (loading: Loading) => A;
      readonly onRefreshing: (refreshing: Refreshing<Item_>) => B;
      readonly onFailure: (failure: Failure<Error_>) => C;
      readonly onStale: (stale: Stale<Item_, Error_>) => D;
      readonly onSuccess: (success: Success<Item_>) => E;
    },
  ): A | B | C | D | E =>
    Match.value(state.phase).pipe(
      Match.tag("Loading", handlers.onLoading),
      Match.tag("Refreshing", handlers.onRefreshing),
      Match.tag("Failure", handlers.onFailure),
      Match.tag("Stale", handlers.onStale),
      Match.tag("Success", handlers.onSuccess),
      Match.exhaustive,
    ) as A | B | C | D | E,
);

const matchesInvalidCursor = (error: unknown): boolean =>
  Match.value(error).pipe(
    Match.when(Ref.isConvexError, ({ data }) => {
      const value: unknown = data;
      return (
        typeof value === "object" &&
        value !== null &&
        "isConvexSystemError" in value &&
        value.isConvexSystemError === true &&
        "paginationError" in value &&
        value.paginationError === "InvalidCursor"
      );
    }),
    Match.when(Match.instanceOf(globalThis.Error), (cause) =>
      cause.message.includes("InvalidCursor"),
    ),
    Match.when(Match.any, () => false),
    Match.exhaustive,
  );

/** Whether a raw page-subscription error reports an invalid cursor. */
export const isInvalidCursor = (error: unknown): boolean =>
  Match.value(error).pipe(
    Match.when(
      Match.instanceOf(WebSocketClientError),
      (webSocketError) =>
        matchesInvalidCursor(webSocketError) ||
        matchesInvalidCursor(webSocketError.cause),
    ),
    Match.when(Match.any, matchesInvalidCursor),
    Match.exhaustive,
  );
