import type { UserIdentity as ConvexUserIdentity } from "convex/server";
import * as Schema from "effect/Schema";
import { expectTypeOf, test } from "vitest";
import * as UserIdentity from "@confect/core/UserIdentity";

test("UserIdentity's encoded type extends Convex type", () => {
  const _userIdentity = UserIdentity.UserIdentity({
    foo: Schema.String,
  });
  type EncodedUserIdentity = (typeof _userIdentity)["Encoded"];

  expectTypeOf<EncodedUserIdentity>().toExtend<ConvexUserIdentity>();
});
