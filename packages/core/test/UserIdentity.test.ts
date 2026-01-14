import type { UserIdentity as ConvexUserIdentity } from "convex/server";
import { Schema } from "effect";
import { expectTypeOf, test } from "vitest";
import * as UserIdentity from "../src/UserIdentity";

test("UserIdentity encoded schema extends Convex type", () => {
  const _userIdentity = UserIdentity.UserIdentity({
    foo: Schema.String,
  });
  type EncodedUserIdentity = typeof _userIdentity.Encoded;

  expectTypeOf<EncodedUserIdentity>().toExtend<ConvexUserIdentity>();
});
