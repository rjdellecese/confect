import * as Chunk from "effect/Chunk";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Key from "./QueryStreamKey";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";

const PageSize = Schema.Natural.pipe(Schema.brand("QueryStream/PageSize"));
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
  ThroughKey: { readonly key: Key.Complete };
  ThroughEnd: {};
}>;
export const Range = Data.taggedEnum<Range>();

export interface ScanRequest {
  readonly numItems: PageSize;
  readonly after: Option.Option<Key.Complete>;
  readonly range: Range;
}

export type Request = Data.TaggedEnum<{
  Unchanged: { readonly cursor: string };
  Scan: ScanRequest;
}>;
const Request = Data.taggedEnum<Request>();

export const parseRequest = (
  numItems: number,
  cursor: string | null,
  after: Option.Option<Key.Complete>,
  range: Range,
): Result.Result<Request, InvalidPageSizeError | EmptyInitialPageError> =>
  Result.flatMap(
    Schema.decodeResult(PageSize)(numItems).pipe(
      Result.mapError(() => new InvalidPageSizeError({ numItems })),
    ),
    (size): Result.Result<Request, EmptyInitialPageError> =>
      size === 0
        ? cursor === null
          ? Result.fail(new EmptyInitialPageError())
          : Result.succeed(Request.Unchanged({ cursor }))
        : Result.succeed(Request.Scan({ numItems: size, after, range })),
  );

/**
 * A nonempty scan, including filtered markers.
 */
type Progress = Chunk.NonEmptyChunk<Key.Complete>;
const append = (
  progress: Option.Option<Progress>,
  key: Key.Complete,
): Progress =>
  Option.match(progress, {
    onNone: () => Chunk.of(key),
    onSome: (keys) => Chunk.append(keys, key),
  });
const size = Chunk.size;
const last = Chunk.lastNonEmpty<Key.Complete>;
const midpoint = (progress: Progress): Key.Complete =>
  Option.getOrElse(
    Chunk.get(progress, Math.floor((Chunk.size(progress) - 1) / 2)),
    () => Chunk.headNonEmpty(progress),
  );

export type State<Doc> =
  | {
      readonly _tag: "Reading";
      readonly page: Chunk.Chunk<Doc>;
      readonly progress: Option.Option<Progress>;
    }
  | {
      readonly _tag: "ItemLimit" | "ReadLimit";
      readonly page: Chunk.Chunk<Doc>;
      readonly progress: Progress;
    };

export const initial = <Doc>(): State<Doc> => ({
  _tag: "Reading",
  page: Chunk.empty(),
  progress: Option.none(),
});

export const record = <Doc>(
  request: ScanRequest,
  state: State<Doc>,
  doc: Option.Option<Doc>,
  key: Key.Complete,
  readLimit: boolean,
): State<Doc> => {
  if (state._tag !== "Reading") return state;
  const progress = append(state.progress, key);
  const page = Option.match(doc, {
    onNone: () => state.page,
    onSome: (value) => Chunk.append(state.page, value),
  });
  return readLimit
    ? { _tag: "ReadLimit", page, progress }
    : request.range._tag === "Unpinned" && Chunk.size(page) >= request.numItems
      ? { _tag: "ItemLimit", page, progress }
      : { _tag: "Reading", page, progress: Option.some(progress) };
};

export type Continuation = Data.TaggedEnum<{
  End: {};
  Key: { readonly key: Key.Complete };
}>;
export const Continuation = Data.taggedEnum<Continuation>();

export type Outcome<Doc> =
  | { readonly _tag: "Done"; readonly page: ReadonlyArray<Doc> }
  | {
      readonly _tag: "Continue";
      readonly page: ReadonlyArray<Doc>;
      readonly key: Key.Complete;
    }
  | {
      readonly _tag: "SplitRequired" | "SplitRecommended";
      readonly page: ReadonlyArray<Doc>;
      readonly continuation: Continuation;
      readonly split: Key.Complete;
    };

export class UnsafePageBoundaryError extends Data.TaggedError(
  "UnsafePageBoundaryError",
)<{
  readonly reason: "NoProgress" | "NoInteriorSplit";
}> {}

const SOFT_MAX_SCAN_LENGTH = 16000;

/**
 * Decide the page result without reading a stream or serializing a cursor.
 */
export const finish = <Doc>(
  request: ScanRequest,
  state: State<Doc>,
  upstreamStopped: boolean,
): Result.Result<Outcome<Doc>, UnsafePageBoundaryError> => {
  const page = Chunk.toArray(state.page);
  const progress =
    state._tag === "Reading" ? state.progress : Option.some(state.progress);
  const readLimit = upstreamStopped || state._tag === "ReadLimit";
  if (readLimit || state._tag === "ItemLimit") {
    return Result.flatMap(
      Result.fromOption(
        progress,
        () => new UnsafePageBoundaryError({ reason: "NoProgress" }),
      ),
      (scanned) => {
        const split = midpoint(scanned);
        if (
          readLimit &&
          request.range._tag === "ThroughKey" &&
          QueryStreamOrderKey.Order(
            Key.values(split),
            Key.values(request.range.key),
          ) === 0
        ) {
          return Result.fail(
            new UnsafePageBoundaryError({ reason: "NoInteriorSplit" }),
          );
        }
        return Result.succeed<Outcome<Doc>>(
          readLimit || size(scanned) >= SOFT_MAX_SCAN_LENGTH
            ? {
                _tag: readLimit ? "SplitRequired" : "SplitRecommended",
                page,
                continuation: Continuation.Key({ key: last(scanned) }),
                split,
              }
            : { _tag: "Continue", page, key: last(scanned) },
        );
      },
    );
  }
  const continuation =
    request.range._tag === "ThroughKey"
      ? Continuation.Key({ key: request.range.key })
      : Continuation.End();
  if (
    request.range._tag !== "Unpinned" &&
    Option.isSome(progress) &&
    (size(progress.value) >= SOFT_MAX_SCAN_LENGTH ||
      page.length > request.numItems + 1)
  ) {
    return Result.succeed({
      _tag: "SplitRecommended",
      page,
      continuation,
      split: midpoint(progress.value),
    });
  }
  return Result.succeed(
    continuation._tag === "End"
      ? { _tag: "Done", page }
      : { _tag: "Continue", page, key: continuation.key },
  );
};
