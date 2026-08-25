import { ConvexError } from "convex/values";
import type { Value } from "convex/values";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** A Convex pagination cursor that no longer describes the current query. */
export class InvalidCursor extends Schema.TaggedError<InvalidCursor>()(
  "InvalidCursor",
  {
    cause: Schema.Defect(),
  },
) {}

interface InvalidCursorData {
  readonly isConvexSystemError: true;
  readonly paginationError: "InvalidCursor";
}

const ConvexErrorIdentifier = Symbol.for("ConvexError");

const isConvexError = (error: unknown): error is ConvexError<Value> =>
  error instanceof ConvexError ||
  (typeof error === "object" &&
    error !== null &&
    ConvexErrorIdentifier in error);

const isInvalidCursorData = (value: unknown): value is InvalidCursorData =>
  typeof value === "object" &&
  value !== null &&
  "isConvexSystemError" in value &&
  value.isConvexSystemError === true &&
  "paginationError" in value &&
  value.paginationError === "InvalidCursor";

/**
 * Recognizes the structured Convex system error and the message-only fallback
 * used by Convex's own pagination clients.
 */
export const fromUnknown = (error: unknown): Option.Option<InvalidCursor> =>
  Match.value(error).pipe(
    Match.when(Match.instanceOf(InvalidCursor), (invalidCursor) =>
      Option.some(invalidCursor),
    ),
    Match.when(isConvexError, (convexError) =>
      Match.value(isInvalidCursorData(convexError.data)).pipe(
        Match.when(true, () =>
          Option.some(new InvalidCursor({ cause: error })),
        ),
        Match.when(false, () =>
          Match.value(convexError.message.includes("InvalidCursor")).pipe(
            Match.when(true, () =>
              Option.some(new InvalidCursor({ cause: error })),
            ),
            Match.when(false, () => Option.none<InvalidCursor>()),
            Match.exhaustive,
          ),
        ),
        Match.exhaustive,
      ),
    ),
    Match.when(isInvalidCursorData, () =>
      Option.some(new InvalidCursor({ cause: error })),
    ),
    Match.when(Match.instanceOf(globalThis.Error), (cause) =>
      Match.value(cause.message.includes("InvalidCursor")).pipe(
        Match.when(true, () => Option.some(new InvalidCursor({ cause }))),
        Match.when(false, () => Option.none<InvalidCursor>()),
        Match.exhaustive,
      ),
    ),
    Match.when(Match.any, () => Option.none<InvalidCursor>()),
    Match.exhaustive,
  );
