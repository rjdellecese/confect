import * as Ref from "@confect/core/Ref";
import { WebSocketClientError } from "@confect/js/WebSocketClient";
import * as Function from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/**
 * A pure page machine for Convex cursor pagination, navigated one page at a
 * time. The machine lives in the Model and is the single source of truth for
 * the one live page subscription: `Subscription.paginatedQuery` derives the
 * subscription's args from this state, so navigating (`next`/`prev`),
 * retrying, and split-pinning are all plain Model transitions that the
 * Foldkit runtime turns into subscription restarts.
 */

/**
 * Identifies one page of results. A page starts just after `cursor` (`null`
 * means the start of the list) and runs to `endCursor` when pinned by a
 * split, or as far as the server's page size allows when not.
 */
export interface PageDescriptor {
  readonly cursor: string | null;
  readonly endCursor: Option.Option<string>;
}

export const PageDescriptor = Schema.Struct({
  cursor: Schema.Union([Schema.String, Schema.Null]),
  endCursor: Schema.Option(Schema.String),
});

/** Why the machine is currently loading. */
export type Direction = "First" | "Next" | "Prev" | "Split" | "Retry";

/**
 * A page is being fetched. `previousItems` keeps the last page that finished
 * loading, so the view can keep rendering it instead of blanking.
 */
export interface Loading<Item_> {
  readonly _tag: "Loading";
  readonly current: PageDescriptor;
  readonly prevStack: ReadonlyArray<PageDescriptor>;
  readonly previousItems: Option.Option<ReadonlyArray<Item_>>;
  readonly direction: Direction;
}

/** The current page is loaded and its subscription is live. */
export interface Loaded<Item_> {
  readonly _tag: "Loaded";
  readonly current: PageDescriptor;
  readonly prevStack: ReadonlyArray<PageDescriptor>;
  readonly items: ReadonlyArray<Item_>;
  readonly continueCursor: string;
  readonly isDone: boolean;
}

/**
 * The page subscription failed and is closed. The error itself is not stored
 * here — it already reached `update` through the subscription's `onError`
 * Message — but the machine must leave the subscription closed so that
 * `retry` (or `reset`) reopens it via a dependency change.
 */
export interface Failed<Item_> {
  readonly _tag: "Failed";
  readonly current: PageDescriptor;
  readonly prevStack: ReadonlyArray<PageDescriptor>;
  readonly previousItems: Option.Option<ReadonlyArray<Item_>>;
}

export type Phase<Item_> = Loading<Item_> | Loaded<Item_> | Failed<Item_>;

/**
 * The machine state. `args` and `numItems` are fixed when the machine is
 * created — cursors are only valid for the exact query and args they were
 * produced by, so changing either means creating a fresh machine with
 * `init`.
 */
export interface State<Item_, UserArgs_> {
  readonly args: UserArgs_;
  readonly numItems: number;
  readonly phase: Phase<Item_>;
}

/**
 * One emission of the page subscription: the decoded `PaginationResult` plus
 * the descriptor it was fetched for. `settle` uses the descriptor to ignore
 * stale results from a subscription that navigation already superseded.
 */
export interface PageResult<Item_> {
  readonly descriptor: PageDescriptor;
  readonly page: ReadonlyArray<Item_>;
  readonly isDone: boolean;
  readonly continueCursor: string;
  readonly splitCursor?: string | null;
  readonly pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

export type Item<Query extends Ref.AnyConfectPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];

export type UserArgs<Query extends Ref.AnyConfectPublicPaginatedQuery> = Omit<
  Ref.Args<Query>,
  "paginationOpts"
>;

/** The schema-and-constructor bundle returned by `make`. */
export interface PaginatedQuery<
  Query extends Ref.AnyConfectPublicPaginatedQuery,
> {
  /** The machine state schema — embed in the Model, typically inside `Schema.Option(...)`. */
  readonly schema: Schema.Codec<State<Item<Query>, UserArgs<Query>>, unknown>;
  /** The `PageResult` schema, for declaring the Message that carries results. */
  readonly pageResult: Schema.Codec<PageResult<Item<Query>>, unknown>;
  /** Creates a machine loading page one. `args` is omitted when the query declares none. */
  readonly init: keyof UserArgs<Query> extends never
    ? (options: {
        readonly numItems: number;
      }) => State<Item<Query>, UserArgs<Query>>
    : (
        args: UserArgs<Query>,
        options: { readonly numItems: number },
      ) => State<Item<Query>, UserArgs<Query>>;
}

const initialPhase = <Item_>(): Loading<Item_> => ({
  _tag: "Loading",
  current: { cursor: null, endCursor: Option.none() },
  prevStack: [],
  previousItems: Option.none(),
  direction: "First",
});

const missingPaginatedProvenanceError = (ref: Ref.AnyConfect) =>
  new globalThis.Error(
    `Paginated query ref "${Ref.getConvexFunctionName(ref)}" was not built ` +
      "with `FunctionSpec.publicPaginatedQuery`. `PaginatedQuery.make` " +
      "requires the user-args and item schemas that constructor stores.",
  );

const paginatedKindOrThrow = (ref: Ref.AnyConfectPublicPaginatedQuery) => {
  if (ref.kind._tag !== "Paginated") {
    throw missingPaginatedProvenanceError(ref);
  }
  return ref.kind;
};

/**
 * Builds the schema-and-constructor bundle for a paginated query ref:
 *
 * ```ts
 * const Notes = PaginatedQuery.make(refs.public.notes.paginate)
 *
 * const Model = Schema.Struct({
 *   notes: Schema.Option(Notes.schema),
 * })
 *
 * // In init or update:
 * Option.some(Notes.init({ numItems: 20 }))
 * ```
 *
 * Requires a ref built with `FunctionSpec.publicPaginatedQuery` — the ref's
 * user-args and item schemas back the state schema, and mismatched schemas
 * are unrepresentable.
 */
export const make = <Query extends Ref.AnyConfectPublicPaginatedQuery>(
  ref: Query,
): PaginatedQuery<Query> => {
  const kind = paginatedKindOrThrow(ref);

  const phaseFields = {
    current: PageDescriptor,
    prevStack: Schema.Array(PageDescriptor),
  };
  const previousItems = Schema.Option(kind.page);

  const schema = Schema.Struct({
    args: kind.userArgs,
    numItems: Schema.Finite,
    phase: Schema.Union([
      Schema.TaggedStruct("Loading", {
        ...phaseFields,
        previousItems,
        direction: Schema.Literals(["First", "Next", "Prev", "Split", "Retry"]),
      }),
      Schema.TaggedStruct("Loaded", {
        ...phaseFields,
        items: kind.page,
        continueCursor: Schema.String,
        isDone: Schema.Boolean,
      }),
      Schema.TaggedStruct("Failed", {
        ...phaseFields,
        previousItems,
      }),
    ]),
  }) as unknown as PaginatedQuery<Query>["schema"];

  const pageResult = Schema.Struct({
    descriptor: PageDescriptor,
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
  }) as unknown as PaginatedQuery<Query>["pageResult"];

  const init = ((
    argsOrOptions: UserArgs<Query> | { readonly numItems: number },
    options?: { readonly numItems: number },
  ): State<Item<Query>, UserArgs<Query>> => {
    const [args, resolvedOptions] =
      options === undefined
        ? [{} as UserArgs<Query>, argsOrOptions as { numItems: number }]
        : [argsOrOptions as UserArgs<Query>, options];
    if (!(resolvedOptions.numItems > 0)) {
      throw new globalThis.Error(
        "`PaginatedQuery.init` requires `numItems` to be greater than zero",
      );
    }
    return {
      args,
      numItems: resolvedOptions.numItems,
      phase: initialPhase(),
    };
  }) as PaginatedQuery<Query>["init"];

  return { schema, pageResult, init };
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
 * Navigate to the next page: the current descriptor is pushed onto the
 * back-stack and the machine starts loading the page that begins where the
 * current one ends — at `endCursor` when the page was pinned by a split, at
 * `continueCursor` otherwise. `None` when the current page isn't loaded or
 * is the last one; `update` should leave the Model unchanged.
 */
export const next = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): Option.Option<State<Item_, UserArgs_>> => {
  const phase = state.phase;
  if (phase._tag !== "Loaded" || phase.isDone) {
    return Option.none();
  }
  return Option.some({
    ...state,
    phase: {
      _tag: "Loading",
      current: {
        cursor: Option.getOrElse(
          phase.current.endCursor,
          () => phase.continueCursor,
        ),
        endCursor: Option.none(),
      },
      prevStack: [...phase.prevStack, phase.current],
      previousItems: Option.some(phase.items),
      direction: "Next",
    },
  });
};

/**
 * Navigate to the previous page by popping the back-stack. A previously
 * split page is re-run with its pinned range. `None` when the current page
 * isn't loaded or is the first one.
 */
export const prev = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): Option.Option<State<Item_, UserArgs_>> => {
  const phase = state.phase;
  if (phase._tag !== "Loaded" || phase.prevStack.length === 0) {
    return Option.none();
  }
  return Option.some({
    ...state,
    phase: {
      _tag: "Loading",
      current: phase.prevStack[phase.prevStack.length - 1]!,
      prevStack: phase.prevStack.slice(0, -1),
      previousItems: Option.some(phase.items),
      direction: "Prev",
    },
  });
};

/**
 * Reopen the subscription after a failure, at the same page. `None` when the
 * machine hasn't failed.
 */
export const retry = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): Option.Option<State<Item_, UserArgs_>> => {
  const phase = state.phase;
  if (phase._tag !== "Failed") {
    return Option.none();
  }
  return Option.some({
    ...state,
    phase: {
      _tag: "Loading",
      current: phase.current,
      prevStack: phase.prevStack,
      previousItems: phase.previousItems,
      direction: "Retry",
    },
  });
};

/**
 * Go back to page one, discarding the back-stack and every held cursor. Use
 * after an `isInvalidCursor` error, or as a "first page" control.
 */
export const reset = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): State<Item_, UserArgs_> => ({
  ...state,
  phase: initialPhase(),
});

/**
 * Record that the page subscription failed and is closed, keeping the
 * machine's position and the last loaded items for display. Reopen with
 * `retry` or `reset`.
 */
export const fail = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): State<Item_, UserArgs_> => {
  const phase = state.phase;
  if (phase._tag === "Failed") {
    return state;
  }
  return {
    ...state,
    phase: {
      _tag: "Failed",
      current: phase.current,
      prevStack: phase.prevStack,
      previousItems:
        phase._tag === "Loaded"
          ? Option.some(phase.items)
          : phase.previousItems,
    },
  };
};

/**
 * Fold a page subscription result into the machine.
 *
 * Results for a descriptor other than the current one are ignored (they come
 * from a subscription that navigation already superseded), as are results
 * arriving after a failure. When the result signals a page split — a
 * `pageStatus` of `"SplitRecommended"` or `"SplitRequired"`, or a page
 * grown past twice `numItems`, with a `splitCursor` to act on — the current
 * page is pinned to end at the split cursor and reloads as a range query;
 * the page after it starts at the split cursor. Otherwise the result loads
 * the page in place (both when a navigation completes and when a live page
 * updates reactively).
 */
export const settle: {
  <Item_>(
    result: PageResult<Item_>,
  ): <UserArgs_>(state: State<Item_, UserArgs_>) => State<Item_, UserArgs_>;
  <Item_, UserArgs_>(
    state: State<Item_, UserArgs_>,
    result: PageResult<Item_>,
  ): State<Item_, UserArgs_>;
} = Function.dual(
  2,
  <Item_, UserArgs_>(
    state: State<Item_, UserArgs_>,
    result: PageResult<Item_>,
  ): State<Item_, UserArgs_> => {
    const phase = state.phase;
    if (
      phase._tag === "Failed" ||
      !descriptorEquals(result.descriptor, phase.current)
    ) {
      return state;
    }

    const splitCursor = result.splitCursor;
    const shouldSplit =
      typeof splitCursor === "string" &&
      (result.pageStatus === "SplitRecommended" ||
        result.pageStatus === "SplitRequired" ||
        result.page.length > 2 * state.numItems);

    if (shouldSplit) {
      return {
        ...state,
        phase: {
          _tag: "Loading",
          current: {
            cursor: phase.current.cursor,
            endCursor: Option.some(splitCursor),
          },
          prevStack: phase.prevStack,
          // A `SplitRequired` page may be incomplete, so keep showing what
          // was already on screen; otherwise the delivered page is complete
          // (just large) and is the freshest thing to show.
          previousItems:
            result.pageStatus === "SplitRequired"
              ? phase._tag === "Loaded"
                ? Option.some(phase.items)
                : phase.previousItems
              : Option.some(result.page),
          direction: "Split",
        },
      };
    }

    return {
      ...state,
      phase: {
        _tag: "Loaded",
        current: phase.current,
        prevStack: phase.prevStack,
        items: result.page,
        continueCursor: result.continueCursor,
        isDone: result.isDone,
      },
    };
  },
);

/**
 * The items to render: the loaded page, or — while loading or after a
 * failure — the last page that finished loading, or an empty array before
 * any page has.
 */
export const page = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): ReadonlyArray<Item_> =>
  state.phase._tag === "Loaded"
    ? state.phase.items
    : Option.getOrElse(
        state.phase.previousItems,
        (): ReadonlyArray<Item_> => [],
      );

/** The 1-indexed number of the current (or currently loading) page. */
export const pageNum = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): number => state.phase.prevStack.length + 1;

export const isFirst = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase.prevStack.length === 0;

export const isLast = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase._tag === "Loaded" && state.phase.isDone;

export const isLoading = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase._tag === "Loading";

export const isLoaded = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase._tag === "Loaded";

export const isFailed = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase._tag === "Failed";

/** Whether `next` would navigate — useful for enabling a "next page" control. */
export const canNext = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase._tag === "Loaded" && !state.phase.isDone;

/** Whether `prev` would navigate — useful for enabling a "previous page" control. */
export const canPrev = <Item_, UserArgs_>(
  state: State<Item_, UserArgs_>,
): boolean => state.phase._tag === "Loaded" && state.phase.prevStack.length > 0;

/** Pattern-match on the machine's phase. */
export const match: {
  <Item_, A, B, C>(handlers: {
    readonly onLoading: (loading: Loading<Item_>) => A;
    readonly onLoaded: (loaded: Loaded<Item_>) => B;
    readonly onFailed: (failed: Failed<Item_>) => C;
  }): <UserArgs_>(state: State<Item_, UserArgs_>) => A | B | C;
  <Item_, UserArgs_, A, B, C>(
    state: State<Item_, UserArgs_>,
    handlers: {
      readonly onLoading: (loading: Loading<Item_>) => A;
      readonly onLoaded: (loaded: Loaded<Item_>) => B;
      readonly onFailed: (failed: Failed<Item_>) => C;
    },
  ): A | B | C;
} = Function.dual(
  2,
  <Item_, UserArgs_, A, B, C>(
    state: State<Item_, UserArgs_>,
    handlers: {
      readonly onLoading: (loading: Loading<Item_>) => A;
      readonly onLoaded: (loaded: Loaded<Item_>) => B;
      readonly onFailed: (failed: Failed<Item_>) => C;
    },
  ): A | B | C => {
    const phase = state.phase;
    switch (phase._tag) {
      case "Loading": {
        return handlers.onLoading(phase);
      }
      case "Loaded": {
        return handlers.onLoaded(phase);
      }
      case "Failed": {
        return handlers.onFailed(phase);
      }
    }
  },
);

const matchesInvalidCursor = (error: unknown): boolean => {
  if (Ref.isConvexError(error)) {
    const data: unknown = (error as { readonly data?: unknown }).data;
    return (
      typeof data === "object" &&
      data !== null &&
      (data as { readonly isConvexSystemError?: unknown })
        .isConvexSystemError === true &&
      (data as { readonly paginationError?: unknown }).paginationError ===
        "InvalidCursor"
    );
  }
  return (
    error instanceof globalThis.Error && error.message.includes("InvalidCursor")
  );
};

/**
 * Whether an error from the page subscription is Convex reporting that a
 * held cursor is no longer valid. Every cursor the machine holds is then
 * dead, so the recovery is `reset`:
 *
 * ```ts
 * FailedNotesPage: ({ error }) =>
 *   PaginatedQuery.isInvalidCursor(error)
 *     ? PaginatedQuery.reset(state)
 *     : PaginatedQuery.fail(state)
 * ```
 */
export const isInvalidCursor = (error: unknown): boolean =>
  matchesInvalidCursor(error) ||
  (error instanceof WebSocketClientError && matchesInvalidCursor(error.cause));
