import * as String from "effect/String";
import { ConvexError } from "convex/values";
import type { Value } from "convex/values";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/**
 * A Convex pagination cursor that no longer describes the current query.
 * Foldkit exposes this failure when it recognizes Convex's invalid-cursor
 * response. Its `_tag` is `"InvalidCursor"`; `cause` retains the original
 * failure or error data. Restart pagination rather than reusing the rejected
 * cursor.
 */
export class InvalidCursor extends Schema.TaggedError<InvalidCursor, {}>()(
  "InvalidCursor",
  {
    /**
     * The original Convex failure or error data, retained for diagnosis.
     */
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

const fromErrorMessage = (
  error: globalThis.Error,
): Option.Option<InvalidCursor> =>
  String.includes("InvalidCursor")(error.message)
    ? Option.some(InvalidCursor.make({ cause: error }))
    : Option.none();

/**
 * Recognizes an invalid-cursor error emitted by a Convex query.
 *
 * @internal
 */
export const fromConvexQueryError = (
  error: unknown,
): Option.Option<InvalidCursor> =>
  Match.value(error).pipe(
    Match.when(isConvexError, (convexError) =>
      Match.value(isInvalidCursorData(convexError.data)).pipe(
        Match.when(true, () =>
          Option.some(InvalidCursor.make({ cause: error })),
        ),
        Match.when(false, () => fromErrorMessage(convexError)),
        Match.exhaustive,
      ),
    ),
    Match.when(Match.instanceOf(globalThis.Error), fromErrorMessage),
    Match.when(Match.any, () => Option.none<InvalidCursor>()),
    Match.exhaustive,
  );

/**
 * Recognizes the error data attached to Convex's invalid-cursor error.
 *
 * @internal
 */
export const fromConvexErrorData = (
  errorData: unknown,
): Option.Option<InvalidCursor> =>
  Match.value(errorData).pipe(
    Match.when(isInvalidCursorData, (cause) =>
      Option.some(InvalidCursor.make({ cause })),
    ),
    Match.when(Match.any, () => Option.none<InvalidCursor>()),
    Match.exhaustive,
  );
