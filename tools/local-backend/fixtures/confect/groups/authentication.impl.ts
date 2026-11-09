import { FunctionImpl, GroupImpl, MiddlewareImpl } from "@confect/server";
import type { SignJwtOptions } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { MutationAuth } from "../_generated/services";
import authentication, {
  SignedToken,
  SignInMiddleware,
} from "./authentication.spec";

const sign = FunctionImpl.make(
  databaseSchema,
  authentication,
  "sign",
  ({ aud, expiresInSeconds, extraClaims }) =>
    Effect.gen(function* () {
      const auth = yield* MutationAuth;
      const options: SignJwtOptions = {
        claims: { aud, ...extraClaims },
        expiresInSeconds,
      };
      return yield* auth.signJwt(options);
    }),
);

const signInMiddleware = FunctionImpl.make(
  databaseSchema,
  authentication,
  "signInMiddleware",
  () => Effect.map(SignedToken, ({ token }) => token),
);

const middleware = MiddlewareImpl.make(
  databaseSchema,
  SignInMiddleware,
  (effect) =>
    Effect.gen(function* () {
      const auth = yield* MutationAuth;
      const token = yield* auth.signJwt({
        claims: { aud: "confect-integration", source: "middleware" },
        expiresInSeconds: 60,
      });
      return yield* effect.pipe(Effect.provideService(SignedToken, { token }));
    }),
);

export default GroupImpl.make(databaseSchema, authentication).pipe(
  Layer.provide(sign),
  Layer.provide(signInMiddleware),
  Layer.provide(middleware),
  GroupImpl.finalize,
);
