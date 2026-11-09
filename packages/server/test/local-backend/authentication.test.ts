import { Ref } from "@confect/core";
import { assert, expect, layer } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import refs from "confect-local-backend/refs";
import * as LocalBackend from "confect-local-backend/LocalBackend";

layer(LocalBackend.layer, { timeout: "120 seconds" })(
  "deployment JWT signing",
  (it) => {
    it.effect.each([
      "confect-integration",
      ["confect-integration", "another-service"],
    ])("verifies deployment signatures for audience %j", (aud) =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const token = yield* Ref.runWithCodec(
          refs.public.groups.authentication.sign,
          {
            aud,
            expiresInSeconds: 60,
            extraClaims: {
              sub: "signing-user",
              jti: "caller-token-id",
              permissions: ["read", "write"],
              metadata: { enabled: true, count: 2, optional: null },
            },
          },
          (ref, args) => client.mutation(ref, args),
        );
        const jwks = createRemoteJWKSet(
          new URL("/.well-known/jwks.json", client.url),
        );
        const { payload, protectedHeader } = yield* Effect.promise(() =>
          jwtVerify(token, jwks, {
            issuer: client.url,
            audience: "confect-integration",
            algorithms: ["ES256"],
          }),
        );
        expect(protectedHeader.alg).toBe("ES256");
        expect(protectedHeader.typ).toBe("JWT");
        expect(typeof protectedHeader.kid).toBe("string");
        expect(payload.aud).toEqual(aud);
        expect(payload.sub).toBe("signing-user");
        expect(payload.jti).toBe("caller-token-id");
        expect(payload.permissions).toEqual(["read", "write"]);
        expect(payload.metadata).toEqual({
          enabled: true,
          count: 2,
          optional: null,
        });
        assert(typeof payload.iat === "number");
        assert(typeof payload.exp === "number");
        expect(payload.exp - payload.iat).toBe(60);
        const expiredAt = DateTime.makeUnsafe((payload.exp + 1) * 1000).pipe(
          DateTime.toDateUtc,
        );
        yield* Effect.promise(() =>
          expect(
            jwtVerify(token, jwks, { audience: "wrong-service" }),
          ).rejects.toBeInstanceOf(errors.JWTClaimValidationFailed),
        );
        yield* Effect.promise(() =>
          expect(
            jwtVerify(token, jwks, {
              audience: "confect-integration",
              currentDate: expiredAt,
            }),
          ).rejects.toBeInstanceOf(errors.JWTExpired),
        );
      }),
    );

    it.effect("signs in mutation-only middleware", () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const jwks = createRemoteJWKSet(
          new URL("/.well-known/jwks.json", client.url),
        );
        const token = yield* Ref.runWithCodec(
          refs.public.groups.authentication.signInMiddleware,
          {},
          (ref, args) => client.mutation(ref, args),
        );
        const { payload } = yield* Effect.promise(() =>
          jwtVerify(token, jwks, {
            issuer: client.url,
            audience: "confect-integration",
            algorithms: ["ES256"],
          }),
        );
        expect(payload.source).toBe("middleware");
      }),
    );

    it.effect.each([1, 3600.9])(
      "accepts lifetime %s and truncates fractional seconds",
      (expiresInSeconds) =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const token = yield* Ref.runWithCodec(
            refs.public.groups.authentication.sign,
            { aud: "confect-integration", expiresInSeconds },
            (ref, args) => client.mutation(ref, args),
          );
          const { payload } = yield* Effect.promise(() =>
            jwtVerify(
              token,
              createRemoteJWKSet(new URL("/.well-known/jwks.json", client.url)),
              { audience: "confect-integration", clockTolerance: 5 },
            ),
          );
          assert(typeof payload.iat === "number");
          assert(typeof payload.exp === "number");
          expect(payload.exp - payload.iat).toBe(Math.floor(expiresInSeconds));
        }),
    );

    it.effect.each(["iss", "iat", "exp", "nbf", "CvxRole", "CoNvEx_role"])(
      "rejects reserved claim %s at the backend",
      (claim) =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const result = yield* Effect.exit(
            Ref.runWithCodec(
              refs.public.groups.authentication.sign,
              {
                aud: "confect-integration",
                expiresInSeconds: 60,
                extraClaims: { [claim]: "forbidden" },
              },
              (ref, args) => client.mutation(ref, args),
            ),
          );
          assert(result._tag === "Failure");
          expect(Cause.pretty(result.cause)).toContain(`'${claim}'`);
          expect(Cause.pretty(result.cause)).toContain("can't be provided");
        }),
    );

    it.effect.each([
      { claim: "sub", value: "" },
      { claim: "sub", value: 123 },
    ])("rejects malformed claims %j at the backend", ({ claim, value }) =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const result = yield* Effect.exit(
          Ref.runWithCodec(
            refs.public.groups.authentication.sign,
            {
              aud: "confect-integration",
              expiresInSeconds: 60,
              extraClaims: { [claim]: value },
            },
            (ref, args) => client.mutation(ref, args),
          ),
        );
        assert(result._tag === "Failure");
        expect(Cause.pretty(result.cause)).toContain(
          `'${claim}' claim must be`,
        );
      }),
    );

    it.effect.each([-1, 0, 0.5, 3601])(
      "rejects lifetime %s at the backend",
      (expiresInSeconds) =>
        Effect.gen(function* () {
          const { client } = yield* LocalBackend.LocalBackend;
          const result = yield* Effect.exit(
            Ref.runWithCodec(
              refs.public.groups.authentication.sign,
              { aud: "confect-integration", expiresInSeconds },
              (ref, args) => client.mutation(ref, args),
            ),
          );
          assert(result._tag === "Failure");
          expect(Cause.pretty(result.cause)).toContain("expiresIn");
        }),
    );
  },
);
