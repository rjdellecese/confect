import * as Chunk from "effect/Chunk";
import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type * as QueryStreamKey from "./QueryStreamKey";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";

const PageSize = Schema.Natural.pipe(
  Schema.brand("~@confect/server/QueryStreamPagination/PageSize"),
);

type PageSize = typeof PageSize.Type;

export class InvalidPageSizeError extends Data.TaggedError(
  "InvalidPageSizeError",
)<{
  readonly numItems: number;
}> {
  override get message(): string {
    return `QueryStream.paginate: numItems must be a nonnegative integer (received ${this.numItems})`;
  }
}

export class EmptyInitialPageError extends Data.TaggedError(
  "EmptyInitialPageError",
) {
  override get message(): string {
    return "QueryStream.paginate: numItems of 0 with a null cursor is not supported";
  }
}

export type Range = Data.TaggedEnum<{
  Unpinned: {};
  ThroughKey: { readonly orderKey: QueryStreamKey.Complete };
  ThroughEnd: {};
}>;

export const Range = Data.taggedEnum<Range>();

export type Start = Data.TaggedEnum<{
  Beginning: {};
  After: {
    readonly orderKey: QueryStreamKey.Complete;
    readonly cursor: string;
  };
}>;

export const Start = Data.taggedEnum<Start>();

export interface ScanRequest {
  readonly numItems: PageSize;
  readonly after: Option.Option<QueryStreamKey.Complete>;
  readonly range: Range;
}

export type Request = Data.TaggedEnum<{
  Unchanged: { readonly cursor: string };
  Scan: ScanRequest;
}>;

const Request = Data.taggedEnum<Request>();

export const parseRequest = (
  numItems: number,
  start: Start,
  range: Range,
): Result.Result<Request, InvalidPageSizeError | EmptyInitialPageError> =>
  Result.flatMap(
    Schema.decodeResult(PageSize)(numItems).pipe(
      Result.mapError(() => new InvalidPageSizeError({ numItems })),
    ),
    (size): Result.Result<Request, EmptyInitialPageError> =>
      size === 0
        ? Start.$match(start, {
            Beginning: () => Result.fail(new EmptyInitialPageError()),
            After: ({ cursor }) =>
              Result.succeed(Request.Unchanged({ cursor })),
          })
        : Result.succeed(
            Request.Scan({
              numItems: size,
              after: Start.$match(start, {
                Beginning: () => Option.none(),
                After: ({ orderKey }) => Option.some(orderKey),
              }),
              range,
            }),
          ),
  );

/**
 * A nonempty scan, including filtered markers.
 */
type Progress = Chunk.NonEmptyChunk<QueryStreamKey.Complete>;

const append = (
  progress: Option.Option<Progress>,
  orderKey: QueryStreamKey.Complete,
): Progress =>
  Option.match(progress, {
    onNone: () => Chunk.of(orderKey),
    onSome: (orderKeys) => Chunk.append(orderKeys, orderKey),
  });

const midpoint = (progress: Progress): QueryStreamKey.Complete =>
  Option.getOrElse(
    Chunk.get(progress, Math.floor((Chunk.size(progress) - 1) / 2)),
    () => Chunk.headNonEmpty(progress),
  );

interface Stopped<Doc> {
  readonly page: Chunk.Chunk<Doc>;
  readonly progress: Progress;
}

export type QueryStreamPagination<Doc> = Data.TaggedEnum<{
  Reading: {
    readonly page: Chunk.Chunk<Doc>;
    readonly progress: Option.Option<Progress>;
  };
  ItemLimit: Stopped<Doc>;
  ReadLimit: Stopped<Doc>;
}>;

interface PaginationDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: QueryStreamPagination<this["A"]>;
}

const QueryStreamPagination = Data.taggedEnum<PaginationDefinition>();

export const initial = <Doc>(): QueryStreamPagination<Doc> =>
  QueryStreamPagination.Reading({
    page: Chunk.empty<Doc>(),
    progress: Option.none(),
  });

export const record = <Doc>(
  request: ScanRequest,
  self: QueryStreamPagination<Doc>,
  doc: Option.Option<Doc>,
  orderKey: QueryStreamKey.Complete,
  readLimit: boolean,
): QueryStreamPagination<Doc> =>
  Match.value(self).pipe(
    Match.tagsExhaustive({
      Reading: (reading) => {
        const progress = append(reading.progress, orderKey);

        const page = Option.match(doc, {
          onNone: () => reading.page,
          onSome: (value) => Chunk.append(reading.page, value),
        });

        const continueReading = () =>
          QueryStreamPagination.Reading({
            page,
            progress: Option.some(progress),
          });

        return readLimit
          ? QueryStreamPagination.ReadLimit({ page, progress })
          : Range.$match(request.range, {
              Unpinned: () =>
                Chunk.size(page) >= request.numItems
                  ? QueryStreamPagination.ItemLimit({ page, progress })
                  : continueReading(),
              ThroughKey: continueReading,
              ThroughEnd: continueReading,
            });
      },
      ItemLimit: () => self,
      ReadLimit: () => self,
    }),
  );

export type Continuation = Data.TaggedEnum<{
  End: {};
  Key: { readonly orderKey: QueryStreamKey.Complete };
}>;

const Continuation = Data.taggedEnum<Continuation>();

interface Split<Doc> {
  readonly page: ReadonlyArray<Doc>;
  readonly continuation: Continuation;
  readonly splitOrderKey: QueryStreamKey.Complete;
}

export type Outcome<Doc> = Data.TaggedEnum<{
  Done: { readonly page: ReadonlyArray<Doc> };
  Continue: {
    readonly page: ReadonlyArray<Doc>;
    readonly orderKey: QueryStreamKey.Complete;
  };
  SplitRequired: Split<Doc>;
  SplitRecommended: Split<Doc>;
}>;

interface OutcomeDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Outcome<this["A"]>;
}

const Outcome = Data.taggedEnum<OutcomeDefinition>();

export class UnsafePageBoundaryError extends Data.TaggedError(
  "UnsafePageBoundaryError",
)<{
  readonly reason: "NoProgress" | "NoInteriorSplit";
}> {
  override get message(): string {
    return Match.value(this.reason).pipe(
      Match.when(
        "NoProgress",
        () => "The read budget stopped the page before any key was scanned",
      ),
      Match.when(
        "NoInteriorSplit",
        () => "The read budget stopped the page without an interior split key",
      ),
      Match.exhaustive,
    );
  }
}

const SOFT_MAX_SCAN_LENGTH = 16000;

/**
 * Decide the page result without reading a stream or serializing a cursor.
 */
export const finish = <Doc>(
  request: ScanRequest,
  self: QueryStreamPagination<Doc>,
  upstreamStopped: boolean,
): Result.Result<Outcome<Doc>, UnsafePageBoundaryError> => {
  const page = Chunk.toArray(self.page);

  const stopped = (
    progress: Option.Option<Progress>,
    readLimit: boolean,
  ): Result.Result<Outcome<Doc>, UnsafePageBoundaryError> =>
    Result.flatMap(
      Result.fromOption(
        progress,
        () => new UnsafePageBoundaryError({ reason: "NoProgress" }),
      ),
      (scanned): Result.Result<Outcome<Doc>, UnsafePageBoundaryError> => {
        const splitOrderKey = midpoint(scanned);

        const atEnd = Range.$match(request.range, {
          Unpinned: () => false,
          ThroughEnd: () => false,
          ThroughKey: ({ orderKey }) =>
            QueryStreamOrderKey.Order(splitOrderKey.values, orderKey.values) ===
            0,
        });

        if (readLimit && atEnd) {
          return Result.fail(
            new UnsafePageBoundaryError({ reason: "NoInteriorSplit" }),
          );
        }

        const orderKey = Chunk.lastNonEmpty(scanned);

        if (readLimit)
          return Result.succeed(
            Outcome.SplitRequired({
              page,
              continuation: Continuation.Key({ orderKey }),
              splitOrderKey,
            }),
          );

        return Result.succeed(
          Chunk.size(scanned) >= SOFT_MAX_SCAN_LENGTH
            ? Outcome.SplitRecommended({
                page,
                continuation: Continuation.Key({ orderKey }),
                splitOrderKey,
              })
            : Outcome.Continue({ page, orderKey }),
        );
      },
    );

  const exhausted = (progress: Option.Option<Progress>): Outcome<Doc> => {
    const finishRange = (
      continuation: Continuation,
      pinned: boolean,
    ): Outcome<Doc> => {
      const split = Option.filter(
        progress,
        (scanned) =>
          pinned &&
          (Chunk.size(scanned) >= SOFT_MAX_SCAN_LENGTH ||
            page.length > request.numItems + 1),
      );

      return Option.match(split, {
        onSome: (scanned): Outcome<Doc> =>
          Outcome.SplitRecommended({
            page,
            continuation,
            splitOrderKey: midpoint(scanned),
          }),
        onNone: () =>
          Continuation.$match(continuation, {
            End: (): Outcome<Doc> => Outcome.Done({ page }),
            Key: ({ orderKey }): Outcome<Doc> =>
              Outcome.Continue({
                page,
                orderKey,
              }),
          }),
      });
    };

    return Range.$match(request.range, {
      Unpinned: () => finishRange(Continuation.End(), false),
      ThroughEnd: () => finishRange(Continuation.End(), true),
      ThroughKey: ({ orderKey }) =>
        finishRange(Continuation.Key({ orderKey }), true),
    });
  };

  return Match.value(self).pipe(
    Match.tagsExhaustive({
      Reading: ({ progress }) =>
        upstreamStopped
          ? stopped(progress, true)
          : Result.succeed(exhausted(progress)),
      ItemLimit: ({ progress }) =>
        stopped(Option.some(progress), upstreamStopped),
      ReadLimit: ({ progress }) => stopped(Option.some(progress), true),
    }),
  );
};
