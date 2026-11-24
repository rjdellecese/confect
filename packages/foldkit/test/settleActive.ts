import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";
import { assert } from "@effect/vitest";

export const settleActive = <Item, Args, Error>(
  state: PaginatedQuery.Active<Item, Args, Error>,
  settlement: PaginatedQuery.Settlement<Item, Args, Error>,
) => {
  const settled = PaginatedQuery.settle(state, settlement);
  assert(settled._tag === "Active");
  return settled;
};
