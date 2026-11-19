import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { InvalidPagination } from "../PlatformError.js";

export const stream = <
  Page extends {
    readonly pagination: {
      readonly hasMore: boolean;
      readonly nextCursor?: string | null | undefined;
    };
  },
  A,
  E,
>(
  operation: string,
  initialCursor: string | undefined,
  fetchPage: (cursor: string | undefined) => Effect.Effect<Page, E>,
  items: (page: Page) => ReadonlyArray<A>,
): Stream.Stream<A, E | InvalidPagination> =>
  Stream.suspend(() => {
    const seen = new Set(initialCursor === undefined ? [] : [initialCursor]);
    return Stream.paginate(initialCursor, (cursor) =>
      Effect.gen(function* () {
        const page = yield* fetchPage(cursor);
        if (!page.pagination.hasMore)
          return [items(page), Option.none()] as const;
        const next = page.pagination.nextCursor;
        if (
          next === null ||
          next === undefined ||
          next === "" ||
          seen.has(next)
        )
          return yield* InvalidPagination.make({ operation });
        seen.add(next);
        return [items(page), Option.some(next)] as const;
      }),
    );
  });
