import { MutationAuth as BarrelMutationAuth } from "@confect/server";
import * as MutationAuth from "@confect/server/MutationAuth";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type {
  MutationAuth as ConvexMutationAuth,
  SignJwtClaims,
  SignJwtOptions,
} from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi } from "vitest";

describe("MutationAuth", () => {
  it("exports the service and retains native claim restrictions", () => {
    expect(BarrelMutationAuth.MutationAuth).toBe(MutationAuth.MutationAuth);
    expectTypeOf<MutationAuth.SignJwtOptions>().toEqualTypeOf<SignJwtOptions>();
    expectTypeOf<MutationAuth.SignJwtClaims>().toEqualTypeOf<SignJwtClaims>();
    expectTypeOf<{ aud: string; sub: string }>().toExtend<SignJwtClaims>();
    expectTypeOf<{ sub: string }>().not.toExtend<SignJwtClaims>();
    expectTypeOf<{ expiresInSeconds: number }>().not.toExtend<SignJwtOptions>();
    expectTypeOf<{ aud: string; iss: string }>().not.toExtend<SignJwtClaims>();
    expectTypeOf<{ aud: string; exp: number }>().not.toExtend<SignJwtClaims>();
    expectTypeOf<{ aud: string; iat: number }>().not.toExtend<SignJwtClaims>();
    expectTypeOf<{ aud: string; nbf: number }>().not.toExtend<SignJwtClaims>();
    expectTypeOf<{
      aud: string;
      CvxRole: string;
    }>().not.toExtend<SignJwtClaims>();
    expectTypeOf<{
      aud: string;
      CoNvExRole: string;
    }>().not.toExtend<SignJwtClaims>();
  });

  it.effect(
    "signs lazily on each execution without copying or mutating options",
    () => {
      const signJwt = vi
        .fn<ConvexMutationAuth["signJwt"]>()
        .mockResolvedValueOnce("first")
        .mockResolvedValueOnce("second")
        .mockResolvedValueOnce("third");
      const native = { signJwt };
      const options: SignJwtOptions = {
        claims: {
          aud: ["service-a", "service-b"],
          sub: "user",
          role: "reader",
          jti: "correlation",
        },
        expiresInSeconds: 60,
      };
      const layer = MutationAuth.layer(native);
      expect(signJwt).not.toHaveBeenCalled();
      return Effect.gen(function* () {
        const services = yield* Layer.build(layer);
        return yield* Effect.gen(function* () {
          const auth = yield* MutationAuth.MutationAuth;
          const signed = auth.signJwt(options);
          expectTypeOf(signed).toEqualTypeOf<Effect.Effect<string>>();
          expect(signJwt).not.toHaveBeenCalled();
          const first = yield* signed;
          const second = yield* signed;
          const otherOptions = {
            claims: { aud: "service-c" },
            expiresInSeconds: 1,
          };
          const third = yield* auth.signJwt(otherOptions);
          expect(first).toBe("first");
          expect(second).toBe("second");
          expect(third).toBe("third");
          expect(signJwt.mock.calls).toEqual([
            [options],
            [options],
            [otherOptions],
          ]);
          expect(signJwt.mock.calls[0]?.[0]).toBe(options);
          expect(signJwt.mock.calls[1]?.[0].claims).toBe(options.claims);
          expect(signJwt.mock.calls[2]?.[0]).toBe(otherOptions);
          expect(signJwt.mock.contexts).toEqual([native, native, native]);
          expect(options).toEqual({
            claims: {
              aud: ["service-a", "service-b"],
              sub: "user",
              role: "reader",
              jti: "correlation",
            },
            expiresInSeconds: 60,
          });
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect(
    "preserves rejected promises and synchronous throws as defects",
    () => {
      const failure = new Error("JWT signing failed");
      const signJwt = vi
        .fn<ConvexMutationAuth["signJwt"]>()
        .mockRejectedValueOnce(failure)
        .mockImplementationOnce(() => {
          throw failure;
        });
      return Effect.gen(function* () {
        const services = yield* Layer.build(MutationAuth.layer({ signJwt }));
        return yield* Effect.gen(function* () {
          const auth = yield* MutationAuth.MutationAuth;
          const signed = auth.signJwt({
            claims: { aud: "service" },
            expiresInSeconds: 60,
          });
          const rejected = yield* signed.pipe(
            Effect.catchDefect(Effect.succeed),
          );
          const thrown = yield* signed.pipe(Effect.catchDefect(Effect.succeed));
          expect(rejected).toBe(failure);
          expect(thrown).toBe(failure);
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );
});
