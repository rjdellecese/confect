import { ConvexError } from "convex/values";
import type { Value } from "convex/values";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

/**
 * A Convex pagination cursor that no longer describes the current query.
 */
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
  (Predicate.isObjectOrArray(error) && ConvexErrorIdentifier in error);

const isInvalidCursorData = (value: unknown): value is InvalidCursorData =>
  Predicate.isObjectOrArray(value) &&
  "isConvexSystemError" in value &&
  value.isConvexSystemError === true &&
  "paginationError" in value &&
  value.paginationError === "InvalidCursor";

const fromErrorMessage = (
  error: globalThis.Error,
): Option.Option<InvalidCursor> =>
  error.message.includes("InvalidCursor")
    ? Option.some(new InvalidCursor({ cause: error }))
    : Option.none();

/**
 * Recognizes an invalid-cursor error emitted by a Convex query.
 */
export const fromConvexQueryError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Query failures are untrusted; the matcher recognizes supported cursor errors and leaves all other values unclassified.
  error: unknown,
): Option.Option<InvalidCursor> =>
  Match.value(error).pipe(
    Match.when(isConvexError, (convexError) =>
      Match.value(isInvalidCursorData(convexError.data)).pipe(
        Match.when(true, () =>
          Option.some(new InvalidCursor({ cause: error })),
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
 */
export const fromConvexErrorData = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Convex error data is untrusted until the cursor-error schema recognizes it.
  errorData: unknown,
): Option.Option<InvalidCursor> =>
  Match.value(errorData).pipe(
    Match.when(isInvalidCursorData, (cause) =>
      Option.some(new InvalidCursor({ cause })),
    ),
    Match.when(Match.any, () => Option.none<InvalidCursor>()),
    Match.exhaustive,
  );
