import * as RecordEffect from "effect/Record";
import { isDeepStrictEqual } from "node:util";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { FunctionSpec } from "@confect/core";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import { RegisteredNodeFunction } from "@confect/server/node";
import { convexTest, type TestConvex } from "convex-test";
import {
  defineSchema,
  makeFunctionReference,
  type SignJwtOptions,
} from "convex/server";
import { createLocalJWKSet, errors, jwtVerify } from "jose";
import * as Console from "effect/Console";
import * as TestConsole from "effect/testing/TestConsole";
import confectSchema from "./fixtures/confect/_generated/schema";
import convexSchema from "./fixtures/confect/_generated/convexSchema";
import type * as CompilerOptions from "confect-test-types/CompilerOptions";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaCompiler from "effect/schema/SchemaCompiler";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import { vi } from "vitest";
import * as DatabaseReader_ from "@confect/server/DatabaseReader";
import * as DocumentIds from "@confect/server/DocumentIds";
import * as DatabaseWriter_ from "@confect/server/DatabaseWriter";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as QueryStream from "@confect/server/QueryStream";
import * as Table from "@confect/server/Table";
import * as Storage from "@confect/server/Storage";
import { StorageReader } from "@confect/server/StorageReader";
import refs from "./fixtures/confect/_generated/refs";
import {
  Auth,
  DatabaseReader,
  DatabaseWriter,
  MutationAuth,
  MutationCtx,
  Scheduler,
  TransactionMetadata,
} from "./fixtures/confect/_generated/services";
import { Id } from "./fixtures/confect/_generated/id";
import type notes from "./fixtures/confect/_generated/tables/notes";
import { PaginationDenied } from "./fixtures/confect/databaseReader.spec";
import {
  Forbidden,
  NotFound,
} from "./fixtures/confect/groups/typedErrors.spec";
import { NodeNotFound } from "./fixtures/confect/typedErrorsNode.spec";
import * as TestConfect from "./TestConfect";
import * as TestConfect_ from "../../../test/src/TestConfect";

it.layer(TestConfect.layer, { buildPerTest: true })(
  "TestConfect JWT signing",
  (test) => {
    test.effect.each([false, true])(
      "signs through run and shares deployment JWKS with identity=%s",
      (authenticated) =>
        Effect.gen(function* () {
          vi.stubEnv("CONVEX_CLOUD_URL", "https://jwt-tests.convex.cloud");
          const testConfect = yield* TestConfect.TestConfect;
          const identified = testConfect.withIdentity({ subject: "jwt-owner" });
          const c = authenticated ? identified : testConfect;
          const baseJwks = yield* testConfect.jwks();
          expectTypeOf(baseJwks).toEqualTypeOf<TestConfect_.DeploymentJwks>();
          expect(baseJwks.keys.length).toBe(1);
          expect(Array.every(baseJwks.keys, (key) => !("d" in key))).toBe(true);
          const options = {
            claims: {
              aud: ["confect-integration", "another-service"],
              sub: "token-subject",
              jti: "caller-token-id",
              permissions: ["read", "write"],
              metadata: { enabled: true, count: 2, optional: null },
            },
            expiresInSeconds: 60,
          } satisfies SignJwtOptions;
          const token = yield* c.run(
            Effect.gen(function* () {
              const auth = yield* MutationAuth;
              const identityAuth = yield* Auth;
              const identity = yield* Effect.result(
                identityAuth.getUserIdentity,
              );
              if (authenticated) {
                assert(identity._tag === "Success");
                expect(identity.success.subject).toBe("jwt-owner");
              } else {
                assert(identity._tag === "Failure");
                expect(identity.failure._tag).toBe("NoUserIdentityFoundError");
              }
              return yield* auth.signJwt(options);
            }),
            Schema.String,
          );
          const identityJwks = yield* identified.jwks();
          const repeatedJwks = yield* testConfect.jwks();
          expect(isDeepStrictEqual(identityJwks, baseJwks)).toBe(true);
          expect(isDeepStrictEqual(repeatedJwks, baseJwks)).toBe(true);
          for (const jwks of [baseJwks, identityJwks]) {
            const { payload, protectedHeader } = yield* Effect.promise(() =>
              jwtVerify(token, createLocalJWKSet(jwks), {
                issuer: "https://jwt-tests.convex.cloud",
                audience: "confect-integration",
                algorithms: ["ES256"],
              }),
            );
            expect(protectedHeader.alg).toBe("ES256");
            expect(protectedHeader.typ).toBe("JWT");
            expect(payload.aud).toEqual(options.claims.aud);
            expect(payload.sub).toBe("token-subject");
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
            const expiredAt = DateTime.makeUnsafe(
              (payload.exp + 1) * 1000,
            ).pipe(DateTime.toDateUtc);
            yield* Effect.promise(() =>
              expect(
                jwtVerify(token, createLocalJWKSet(jwks), {
                  audience: "wrong-service",
                }),
              ).rejects.toBeInstanceOf(errors.JWTClaimValidationFailed),
            );
            yield* Effect.promise(() =>
              expect(
                jwtVerify(token, createLocalJWKSet(jwks), {
                  audience: "confect-integration",
                  currentDate: expiredAt,
                }),
              ).rejects.toBeInstanceOf(errors.JWTExpired),
            );
          }
        }).pipe(Effect.ensuring(Effect.sync(() => vi.unstubAllEnvs()))),
    );

    test.effect("rejects tokens from another TestConfect instance", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const token = yield* c.run(
          Effect.gen(function* () {
            const auth = yield* MutationAuth;
            return yield* auth.signJwt({
              claims: { aud: "confect-integration" },
              expiresInSeconds: 60,
            });
          }),
          Schema.String,
        );
        const otherContext = yield* TestConfect.layer.pipe(
          Layer.fresh,
          Layer.build,
        );
        const otherJwks = yield* Effect.gen(function* () {
          const other = yield* TestConfect.TestConfect;
          return yield* other.jwks();
        }).pipe(Effect.provideContext(otherContext));
        yield* Effect.promise(() =>
          expect(
            jwtVerify(token, createLocalJWKSet(otherJwks), {
              audience: "confect-integration",
            }),
          ).rejects.toBeInstanceOf(errors.JWKSNoMatchingKey),
        );
      }).pipe(Effect.scoped),
    );

    test.effect.each([1, 3600.9])(
      "accepts lifetime %s and truncates fractional seconds",
      (expiresInSeconds) =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const token = yield* c.run(
            Effect.gen(function* () {
              const auth = yield* MutationAuth;
              return yield* auth.signJwt({
                claims: { aud: "confect-integration" },
                expiresInSeconds,
              });
            }),
            Schema.String,
          );
          const jwks = yield* c.jwks();
          const { payload } = yield* Effect.promise(() =>
            jwtVerify(token, createLocalJWKSet(jwks), {
              audience: "confect-integration",
              clockTolerance: 5,
            }),
          );
          assert(typeof payload.iat === "number");
          assert(typeof payload.exp === "number");
          expect(payload.exp - payload.iat).toBe(Math.floor(expiresInSeconds));
        }),
    );

    test.effect.each(["iss", "iat", "exp", "nbf", "CvxRole", "CoNvEx_role"])(
      "keeps reserved claim %s failures as defects",
      (claim) =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* c.run(
            Effect.gen(function* () {
              const auth = yield* MutationAuth;
              const extraClaims: Record<string, string> = {
                [claim]: "forbidden",
              };
              const options: SignJwtOptions = {
                claims: { aud: "confect-integration", ...extraClaims },
                expiresInSeconds: 60,
              };
              const result = yield* Effect.exit(auth.signJwt(options));
              assert(result._tag === "Failure");
              expect(Cause.hasDies(result.cause)).toBe(true);
              expect(Cause.pretty(result.cause)).toContain(`'${claim}'`);
              expect(Cause.pretty(result.cause)).toContain("can't be provided");
            }),
          );
        }),
    );

    test.effect.each([-1, 0, 0.5, 3601])(
      "keeps invalid lifetime %s failures as defects",
      (expiresInSeconds) =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* c.run(
            Effect.gen(function* () {
              const auth = yield* MutationAuth;
              const result = yield* Effect.exit(
                auth.signJwt({
                  claims: { aud: "confect-integration" },
                  expiresInSeconds,
                }),
              );
              assert(result._tag === "Failure");
              expect(Cause.hasDies(result.cause)).toBe(true);
              expect(Cause.pretty(result.cause)).toContain("expiresIn");
            }),
          );
        }),
    );
  },
);

describe("mock search compatibility", () => {
  const table = Table.make(() =>
    Schema.Struct({
      text: Schema.optionalKey(
        Schema.Union([Schema.String, Schema.Null, Schema.Finite]),
      ),
    }),
  ).searchIndex("text", { searchField: "text" })("entries");
  const schema = DatabaseSchema.make({ entries: table });
  const layer = TestConfect_.layer(
    schema,
    defineSchema({ entries: Table.tableDefinition(table) }),
    import.meta.glob("./fixtures/convex/_generated/*.js"),
  );
  it.layer(layer, { buildPerTest: true })("non-string fields", (test) => {
    test.effect.each([undefined, null, 123])(
      "skips non-string search field %j through Confect readers",
      (value) =>
        Effect.gen(function* () {
          const c = yield* TestConfect_.TestConfect<typeof schema>();
          yield* c.run(
            Effect.gen(function* () {
              const writer =
                yield* DatabaseWriter_.DatabaseWriter<typeof schema>();
              const reader =
                yield* DatabaseReader_.DatabaseReader<typeof schema>();
              yield* writer
                .table("entries")
                .insert(value === undefined ? {} : { text: value });
              yield* writer
                .table("entries")
                .insert({ text: "123 null undefined" });
              const results = yield* reader
                .table("entries")
                .search("text", (q) => q.search("text", String(value)))
                .collect();
              expect(Array.map(results, (doc) => doc.text)).toEqual([
                "123 null undefined",
              ]);
            }),
          );
        }),
    );
  });
});

it.layer(TestConfect.layer, { buildPerTest: true })(
  "mock query compatibility",
  (test) => {
    test.effect("pins the Effect clock inside TestConfect.run", () =>
      Effect.gen(function* () {
        vi.useFakeTimers({ now: 1_750_000_000_000 });
        const c = yield* TestConfect.TestConfect;
        yield* c.run(
          Effect.gen(function* () {
            const before = yield* Clock.currentTimeMillis;
            vi.setSystemTime(1_750_000_001_000);
            const writer = yield* DatabaseWriter;
            const reader = yield* DatabaseReader;
            const id = yield* writer.table("notes").insert({ text: "pinned" });
            const doc = yield* reader.table("notes").get(id);
            const after = yield* Clock.currentTimeMillis;
            expect(before).toBe(1_750_000_000_000);
            expect(after).toBe(before);
            expect(doc._creationTime).toBeGreaterThanOrEqual(before);
          }),
        );
      }).pipe(Effect.ensuring(Effect.sync(() => vi.useRealTimers()))),
    );

    test.effect(
      "enforces search candidate limits without blocking early reads",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* c.run(
            Effect.gen(function* () {
              const writer = yield* DatabaseWriter;
              const reader = yield* DatabaseReader;
              for (let i = 0; i < 1025; i++) {
                yield* writer
                  .table("notes")
                  .insert({ text: "candidate", tag: "skip" });
              }
              const search = () =>
                reader
                  .table("notes")
                  .search("text", (q) => q.search("text", "candidate"));
              const taken = yield* search().take(2);
              expect(taken).toHaveLength(2);
              const page = yield* search().paginate({
                numItems: 2,
                cursor: null,
              });
              expect(page.page).toHaveLength(2);
              const collected = yield* Effect.exit(search().collect());
              assert(collected._tag === "Failure");
              expect(Cause.pretty(collected.cause)).toContain(
                "Search query scanned too many documents",
              );
              const filtered = yield* Effect.exit(
                search().paginate({ numItems: 1, cursor: null }, (q) =>
                  q.eq(q.field("tag"), "keep"),
                ),
              );
              assert(filtered._tag === "Failure");
              expect(Cause.pretty(filtered.cause)).toContain(
                "Search query scanned too many documents",
              );
            }),
          );
        }),
    );

    test.effect(
      "allows multiple native pagination pages in TestConfect.run",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* c.run(
            Effect.gen(function* () {
              const writer = yield* DatabaseWriter;
              const reader = yield* DatabaseReader;
              yield* writer.table("notes").insert({ text: "first" });
              yield* writer.table("notes").insert({ text: "second" });
              const first = yield* reader
                .table("notes")
                .index("by_text")
                .paginate({ numItems: 1, cursor: null });
              const second = yield* reader
                .table("notes")
                .index("by_text")
                .paginate({ numItems: 1, cursor: first.continueCursor });
              expect(Array.map(first.page, (doc) => doc.text)).toEqual([
                "first",
              ]);
              expect(Array.map(second.page, (doc) => doc.text)).toEqual([
                "second",
              ]);
            }),
          );
        }),
    );
  },
);

describe("Generated function registration", () => {
  it.effect("retains the single-pagination budget in registered queries", () =>
    Effect.gen(function* () {
      const item = FunctionRegistryItem.make({
        functionSpec: FunctionSpec.publicQuery({
          name: "run",
          returns: () => Schema.Null,
        }),
        groupMiddlewareAttachments: [],
        handler: () =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;
            yield* reader
              .table("notes")
              .index("by_text")
              .paginate({ numItems: 1, cursor: null });
            yield* reader
              .table("notes")
              .index("by_text")
              .paginate({ numItems: 1, cursor: null });
            return null;
          }).pipe(Effect.orDie),
      });
      assert(item._tag === "Confect");
      const registered = RegisteredConvexFunction.make(confectSchema, item);
      const t = convexTest(convexSchema, {
        ...import.meta.glob("./fixtures/convex/_generated/*.js"),
        "./fixtures/convex/paginationBudget.ts": () =>
          Promise.resolve({ run: registered }),
      });
      const result = yield* Effect.exit(
        Effect.promise(() =>
          t.query(makeFunctionReference<"query">("paginationBudget:run"), {}),
        ),
      );
      assert(result._tag === "Failure");
      expect(Cause.pretty(result.cause)).toContain("single paginated query");
    }),
  );

  it.effect("defers validators across generated handler forwarding", () =>
    Effect.gen(function* () {
      const compileArgs = vi.spyOn(SchemaToValidator, "compileArgsSchema");
      const compileReturns = vi.spyOn(
        SchemaToValidator,
        "compileReturnsSchema",
      );
      try {
        yield* Effect.promise(() => import("./fixtures/convex/groups/notes"));
        expect(compileArgs).not.toHaveBeenCalled();
        expect(compileReturns).not.toHaveBeenCalled();

        const backend = convexTest(
          convexSchema,
          import.meta.glob([
            "./fixtures/convex/**/*.ts",
            "./fixtures/convex/**/*.js",
            "!./fixtures/convex/**/*.*.*",
          ]),
        );
        const list = makeFunctionReference<"query">("groups/notes:list");
        const promiseResult = yield* Effect.promise(() =>
          backend.query(list, {}),
        );
        expect(promiseResult).toEqual([]);
        expect(compileArgs).toHaveBeenCalledOnce();
        expect(compileReturns).toHaveBeenCalledOnce();

        const promiseResult2 = yield* Effect.promise(() =>
          backend.query(list, {}),
        );
        expect(promiseResult2).toEqual([]);
        expect(compileArgs).toHaveBeenCalledOnce();
        expect(compileReturns).toHaveBeenCalledOnce();
      } finally {
        compileArgs.mockRestore();
        compileReturns.mockRestore();
      }
    }),
  );
});

describe("DocumentIds", () => {
  const cases = [
    {
      name: "public query",
      spec: FunctionSpec.publicQuery({
        name: "run",
        args: () => ({ input: Schema.String }),
        returns: () => Schema.Boolean,
      }),
      invoke: (t: ReturnType<typeof convexTest>, input: string) =>
        t.query(makeFunctionReference<"query">("documentIds:run"), { input }),
    },
    {
      name: "internal query",
      spec: FunctionSpec.internalQuery({
        name: "run",
        args: () => ({ input: Schema.String }),
        returns: () => Schema.Boolean,
      }),
      invoke: (t: ReturnType<typeof convexTest>, input: string) =>
        t.query(makeFunctionReference<"query">("documentIds:run"), { input }),
    },
    {
      name: "public mutation",
      spec: FunctionSpec.publicMutation({
        name: "run",
        args: () => ({ input: Schema.String }),
        returns: () => Schema.Boolean,
      }),
      invoke: (t: ReturnType<typeof convexTest>, input: string) =>
        t.mutation(makeFunctionReference<"mutation">("documentIds:run"), {
          input,
        }),
    },
    {
      name: "internal mutation",
      spec: FunctionSpec.internalMutation({
        name: "run",
        args: () => ({ input: Schema.String }),
        returns: () => Schema.Boolean,
      }),
      invoke: (t: ReturnType<typeof convexTest>, input: string) =>
        t.mutation(makeFunctionReference<"mutation">("documentIds:run"), {
          input,
        }),
    },
  ];
  it.effect.each(cases)(
    "provides ID operations to a registered $name",
    ({ spec, invoke }) =>
      Effect.gen(function* () {
        const item = FunctionRegistryItem.make({
          functionSpec: spec,
          groupMiddlewareAttachments: [],
          handler: ({ input }) =>
            Effect.gen(function* () {
              const ids =
                yield* DocumentIds.DocumentIds<typeof confectSchema>();
              const parsed = yield* ids.parse("notes", input);
              const identified = yield* ids.identify(input);
              const parseResult = yield* ids.parse("users", input);
              return (
                Option.isSome(parsed) &&
                parsed.value === input &&
                Option.isSome(identified) &&
                identified.value.table === "notes" &&
                identified.value.id === input &&
                Option.isNone(parseResult)
              );
            }),
        });
        assert(item._tag === "Confect");
        const registered = RegisteredConvexFunction.make(confectSchema, item);
        const t = convexTest(convexSchema, {
          ...import.meta.glob("./fixtures/convex/_generated/*.js"),
          "./fixtures/convex/documentIds.ts": () =>
            Promise.resolve({ run: registered }),
        });
        const id = yield* Effect.promise(() =>
          t.run(({ db }) =>
            db
              .insert("notes", { text: "ID inspection" })
              .then((inserted) =>
                db.delete("notes", inserted).then(() => inserted),
              ),
          ),
        );
        const promiseResult3 = yield* Effect.promise(() => invoke(t, id));
        expect(promiseResult3).toBe(true);
      }),
  );
});

describe("Storage", () => {
  const read = Effect.gen(function* () {
    const storage = yield* Storage.Storage;
    const legacy = yield* StorageReader;
    return storage.getUrl === legacy.getUrl
      ? "shared reader"
      : "different readers";
  });
  const write = Effect.gen(function* () {
    const storage = yield* Storage.Storage;
    return (yield* storage.generateUploadUrl).protocol;
  });
  const roundtrip = Effect.gen(function* () {
    const storage = yield* Storage.Storage;
    const id = yield* storage.store(new Blob(["storage roundtrip"]));
    const getUrlResult = yield* storage.getUrl(id);
    expect(getUrlResult).toBeInstanceOf(URL);
    const blob = yield* storage.get(id);
    const text = yield* Effect.promise(() => blob.text());
    yield* storage.delete(id);
    expect((yield* Effect.flip(storage.get(id))).id).toBe(id);
    expect((yield* Effect.flip(storage.getUrl(id))).id).toBe(id);
    return text;
  }).pipe(Effect.orDie);
  const cases = [
    {
      name: "query",
      spec: FunctionSpec.publicQuery({
        name: "run",
        returns: () => Schema.String,
      }),
      handler: read,
      expected: "shared reader",
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.query(makeFunctionReference<"query">("storage:run"), {}),
    },
    {
      name: "mutation",
      spec: FunctionSpec.publicMutation({
        name: "run",
        returns: () => Schema.String,
      }),
      handler: write,
      expected: "https:",
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.mutation(makeFunctionReference<"mutation">("storage:run"), {}),
    },
    {
      name: "mutation Blob roundtrip",
      spec: FunctionSpec.publicMutation({
        name: "run",
        returns: () => Schema.String,
      }),
      handler: roundtrip,
      expected: "storage roundtrip",
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.mutation(makeFunctionReference<"mutation">("storage:run"), {}),
    },
    {
      name: "action",
      spec: FunctionSpec.publicAction({
        name: "run",
        returns: () => Schema.String,
      }),
      handler: roundtrip,
      expected: "storage roundtrip",
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.action(makeFunctionReference<"action">("storage:run"), {}),
    },
    {
      name: "Node action",
      spec: FunctionSpec.publicNodeAction({
        name: "run",
        returns: () => Schema.String,
      }),
      handler: roundtrip,
      expected: "storage roundtrip",
      register: RegisteredNodeFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.action(makeFunctionReference<"action">("storage:run"), {}),
    },
  ];

  it.effect.each(cases)(
    "provides unified storage to a registered $name",
    ({ spec, handler, expected, register, invoke }) =>
      Effect.gen(function* () {
        const item = FunctionRegistryItem.make({
          functionSpec: spec,
          groupMiddlewareAttachments: [],
          handler: () => handler,
        });
        assert(item._tag === "Confect");
        const registered = register(confectSchema, item);
        const t = convexTest(convexSchema, {
          ...import.meta.glob("./fixtures/convex/_generated/*.js"),
          "./fixtures/convex/storage.ts": () =>
            Promise.resolve({ run: registered }),
        });
        const promiseResult4 = yield* Effect.promise(() => invoke(t));
        expect(promiseResult4).toBe(expected);
      }),
  );
});

it.layer(TestConfect.layer, { buildPerTest: true })(
  "TestConfect Blob storage",
  (test) => {
    test.effect.each([false, true])(
      "provides Blob storage through run with identity=%s",
      (authenticated) =>
        Effect.gen(function* () {
          const testConfect = yield* TestConfect.TestConfect;
          const c = authenticated
            ? testConfect.withIdentity({ subject: "storage-owner" })
            : testConfect;
          yield* c.run(
            Effect.gen(function* () {
              const storage = yield* Storage.Storage;
              const id = yield* storage.store(
                new Blob(["TestConfect Blob"], { type: "text/plain" }),
              );
              const blob = yield* storage.get(id);
              const text = yield* Effect.promise(() => blob.text());
              expect(text).toBe("TestConfect Blob");
              expect(blob.type).toBe("text/plain");
              yield* storage.delete(id);
              expect((yield* Effect.flip(storage.get(id))).id).toBe(id);
            }),
          );
        }),
    );
  },
);

describe("mutation Blob transactions", () => {
  const modules = import.meta.glob("./fixtures/convex/_generated/*.js");
  const run = <A, E>(
    t: TestConvex<typeof convexSchema>,
    effect: Effect.Effect<
      A,
      E,
      RegisteredConvexFunction.MutationServices<typeof confectSchema>
    >,
  ) =>
    Effect.promise(() =>
      t.mutation((ctx) =>
        Effect.runPromise(
          effect.pipe(
            Effect.provide(
              RegisteredConvexFunction.mutationLayer(confectSchema, ctx),
            ),
          ),
        ),
      ),
    );

  it.effect.each(["application/octet-stream", ""])(
    "preserves bytes, SHA256 and MIME type %j",
    (type) =>
      Effect.gen(function* () {
        const t = convexTest(convexSchema, modules);
        const id = yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            const storageId = yield* storage.store(
              new Blob([new Uint8Array([12, 0])], { type }),
              { sha256: "v2DkNJys5rzg1VLo14NCjbZtDWSb2eQwo2J+LuFKyDk=" },
            );
            const blob = yield* storage.get(storageId);
            expect(blob.type).toBe(type);
            const buffer = yield* Effect.promise(() => blob.arrayBuffer());
            expect(new Uint8Array(buffer)).toEqual(new Uint8Array([12, 0]));
            return storageId;
          }),
        );
        yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            const reader = yield* DatabaseReader;
            const blob = yield* storage.get(id);
            expect(blob.size).toBe(2);
            expect(blob.type).toBe(type);
            const metadata = yield* reader.table("_storage").get(id);
            expect(metadata.sha256).toBe(
              "v2DkNJys5rzg1VLo14NCjbZtDWSb2eQwo2J+LuFKyDk=",
            );
            expect(metadata.contentType).toBe(type || undefined);
          }),
        );
      }),
  );

  it.effect("rejects a mismatched SHA256 without persisting a file", () =>
    Effect.gen(function* () {
      const t = convexTest(convexSchema, modules);
      const result = yield* Effect.exit(
        run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            yield* storage.store(new Blob(["invalid digest"]), {
              sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            });
          }),
        ),
      );
      assert(result._tag === "Failure");
      expect(Cause.pretty(result.cause)).toMatch(/Sha256 mismatch/);
      yield* run(
        t,
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const files = yield* reader
            .table("_storage")
            .index("by_creation_time")
            .collect();
          expect(files).toEqual([]);
        }),
      );
    }),
  );

  it.effect(
    "rolls back stored bytes and restores deleted files on failure",
    () =>
      Effect.gen(function* () {
        const t = convexTest(convexSchema, modules);
        const existingId = yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            return yield* storage.store(new Blob(["existing"]));
          }),
        );
        const createdIds: (typeof existingId)[] = [];
        const result = yield* Effect.exit(
          run(
            t,
            Effect.gen(function* () {
              const storage = yield* Storage.Storage;
              const id = yield* storage.store(new Blob(["rolled back"]));
              createdIds.push(id);
              yield* storage.delete(existingId);
              expect((yield* Effect.flip(storage.get(existingId))).id).toBe(
                existingId,
              );
              return yield* Effect.die("storage rollback");
            }),
          ),
        );
        assert(result._tag === "Failure");
        expect(Cause.pretty(result.cause)).toContain("storage rollback");
        expect(createdIds).toHaveLength(1);
        yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            const reader = yield* DatabaseReader;
            const blob = yield* storage.get(existingId);
            const text = yield* Effect.promise(() => blob.text());
            expect(text).toBe("existing");
            for (const id of createdIds) {
              expect((yield* Effect.flip(storage.get(id))).id).toBe(id);
              expect((yield* Effect.flip(storage.getUrl(id))).id).toBe(id);
            }
            const files = yield* reader
              .table("_storage")
              .index("by_creation_time")
              .collect();
            expect(Array.map(files, (file) => file._id)).toEqual([existingId]);
          }),
        );
      }),
  );

  it.effect.each([
    {
      limits: { filesWritten: 1 },
      oversized: 1,
      error: /Too many files stored/,
    },
    {
      limits: { fileWriteBytes: 4 },
      oversized: 2,
      error: /Too large total size of the files stored/,
    },
  ])(
    "preserves write accounting after caught limit failures: $limits",
    ({ limits, oversized, error }) =>
      Effect.gen(function* () {
        const t = convexTest({
          schema: convexSchema,
          modules,
          transactionLimits: limits,
        });
        yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            const transaction = yield* TransactionMetadata;
            const id = yield* storage.store(new Blob([new Uint8Array(3)]));
            yield* storage.get(id);
            for (let i = 0; i < 2; i++) {
              const result = yield* Effect.exit(
                storage.store(new Blob([new Uint8Array(oversized)])),
              );
              assert(result._tag === "Failure");
              expect(Cause.pretty(result.cause)).toMatch(error);
            }
            const beforeDelete = yield* transaction.getMetrics();
            expect(beforeDelete.filesWritten.used).toBe(1);
            expect(beforeDelete.fileWriteBytes.used).toBe(3);
            expect(beforeDelete.filesRead.used).toBe(0);
            expect(beforeDelete.fileReadBytes.used).toBe(0);
            yield* storage.delete(id);
            expect((yield* Effect.flip(storage.get(id))).id).toBe(id);
            const afterDelete = yield* transaction.getMetrics();
            expect(afterDelete.filesWritten.used).toBe(0);
            expect(afterDelete.fileWriteBytes.used).toBe(0);
            yield* storage.store(new Blob([new Uint8Array(4)]));
            const after = yield* transaction.getMetrics();
            expect(after.filesWritten.used).toBe(1);
            expect(after.fileWriteBytes.used).toBe(4);
          }),
        );
        yield* run(
          t,
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;
            const files = yield* reader
              .table("_storage")
              .index("by_creation_time")
              .collect();
            expect(files).toHaveLength(1);
            expect(files[0]?.size).toBe(4);
          }),
        );
      }),
  );

  it.effect.each([
    { limits: { filesRead: 1 }, error: /Too many files read/ },
    {
      limits: { fileReadBytes: 4 },
      error: /Too large total size of the files read/,
    },
  ])(
    "counts distinct reads and excludes caught failures: $limits",
    ({ limits, error }) =>
      Effect.gen(function* () {
        const t = convexTest({
          schema: convexSchema,
          modules,
          transactionLimits: limits,
        });
        const ids = yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            const first = yield* storage.store(new Blob([new Uint8Array(4)]));
            const second = yield* storage.store(new Blob([new Uint8Array(1)]));
            const missing = yield* storage.store(new Blob(["deleted"]));
            yield* storage.delete(missing);
            return { first, second, missing };
          }),
        );
        yield* run(
          t,
          Effect.gen(function* () {
            const storage = yield* Storage.Storage;
            const transaction = yield* TransactionMetadata;
            expect((yield* Effect.flip(storage.get(ids.missing))).id).toBe(
              ids.missing,
            );
            yield* storage.get(ids.first);
            yield* storage.get(ids.first);
            for (let i = 0; i < 2; i++) {
              const result = yield* Effect.exit(storage.get(ids.second));
              assert(result._tag === "Failure");
              expect(Cause.pretty(result.cause)).toMatch(error);
            }
            const metrics = yield* transaction.getMetrics();
            expect(metrics.filesRead.used).toBe(1);
            expect(metrics.fileReadBytes.used).toBe(4);
            expect(metrics.filesWritten.used).toBe(0);
            expect(metrics.fileWriteBytes.used).toBe(0);
          }),
        );
      }),
  );
});

describe("function logging", () => {
  const cases = [
    {
      name: "query",
      spec: FunctionSpec.publicQuery({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.query(makeFunctionReference<"query">("logging:run"), {}),
    },
    {
      name: "mutation",
      spec: FunctionSpec.publicMutation({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.mutation(makeFunctionReference<"mutation">("logging:run"), {}),
    },
    {
      name: "action",
      spec: FunctionSpec.publicAction({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.action(makeFunctionReference<"action">("logging:run"), {}),
    },
    {
      name: "Node action",
      spec: FunctionSpec.publicNodeAction({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredNodeFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.action(makeFunctionReference<"action">("logging:run"), {}),
    },
  ];

  it.effect.each(cases)(
    "installs the default logger for a registered $name",
    ({ name, spec, register, invoke }) =>
      Effect.gen(function* () {
        const console = {
          ...(yield* TestConsole.make),
          warn: vi.fn(),
          log: vi.fn(),
        };
        const item = FunctionRegistryItem.make({
          functionSpec: spec,
          groupMiddlewareAttachments: [],
          handler: () =>
            Effect.logWarning(name).pipe(
              Effect.as(null),
              Effect.provideService(Console.Console, console),
            ),
        });
        assert(item._tag === "Confect");
        const registered = register(confectSchema, item);
        const t = convexTest(convexSchema, {
          ...import.meta.glob("./fixtures/convex/_generated/*.js"),
          "./fixtures/convex/logging.ts": () =>
            Promise.resolve({ run: registered }),
        });
        const promiseResult5 = yield* Effect.promise(() => invoke(t));
        expect(promiseResult5).toBeNull();
        expect(console.warn).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ level: "WARN", message: name }),
        );
        expect(console.log).not.toHaveBeenCalled();
      }),
  );
});

it.layer(TestConfect.layer, { buildPerTest: true })(
  "TransactionMetadata",
  (test) => {
    test.effect.each([false, true])(
      "keeps snapshot timestamps fixed across writes with identity=%s",
      (authenticated) =>
        Effect.gen(function* () {
          const testConfect = yield* TestConfect.TestConfect;
          const c = authenticated
            ? testConfect.withIdentity({ subject: "snapshot-owner" })
            : testConfect;
          const before = yield* c.run(
            Effect.gen(function* () {
              const transaction = yield* TransactionMetadata;
              const writer = yield* DatabaseWriter;
              const snapshot = transaction.getSnapshotTs();
              const timestamp = yield* snapshot;
              expect(typeof timestamp).toBe("bigint");
              yield* writer.table("notes").insert({ text: "snapshot" });
              const repeated = yield* snapshot;
              expect(repeated).toBe(timestamp);
              return timestamp;
            }),
            Schema.BigInt,
          );
          const after = yield* c.run(
            Effect.gen(function* () {
              const transaction = yield* TransactionMetadata;
              return yield* transaction.getSnapshotTs();
            }),
            Schema.BigInt,
          );
          expect(after).toBeGreaterThan(before);
        }),
    );

    test.effect("reads updated metrics after database operations", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        yield* c.run(
          Effect.gen(function* () {
            const transaction = yield* TransactionMetadata;
            const writer = yield* DatabaseWriter;
            const reader = yield* DatabaseReader;
            const getMetrics = transaction.getMetrics();
            const before = yield* getMetrics;

            const id = yield* writer.table("notes").insert({ text: "metrics" });
            yield* reader.table("notes").get(id);
            const after = yield* getMetrics;

            expect(after.documentsWritten.used).toBeGreaterThan(
              before.documentsWritten.used,
            );
            expect(after.documentsRead.used).toBeGreaterThan(
              before.documentsRead.used,
            );
          }),
        );
      }),
    );
  },
);

it.layer(TestConfect.layer, { buildPerTest: true })("Scheduler", (test) => {
  test.effect("cancels a pending function without executing it", () =>
    Effect.gen(function* () {
      vi.useFakeTimers();
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const scheduler = yield* Scheduler;
          const reader = yield* DatabaseReader;
          const id = yield* scheduler.runAfter(
            Duration.minutes(5),
            refs.public.groups.notes.insert,
            { text: "This function must not run" },
          );

          yield* scheduler.cancel(id);

          const scheduled = yield* reader.table("_scheduled_functions").get(id);
          expect(scheduled.state.kind).toBe("canceled");
        }),
      );

      yield* c.finishAllScheduledFunctions(() => vi.runAllTimers());

      const queryResult2 = yield* c.query(refs.public.groups.notes.list);
      expect(queryResult2).toEqual([]);
    }).pipe(Effect.ensuring(Effect.sync(() => vi.useRealTimers()))),
  );
});

it.layer(TestConfect.layer, { buildPerTest: true })(
  "DatabaseReader",
  (test) => {
    test.effect(
      "uses the canonical Doc decoder across database read paths",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          yield* c.run(
            Effect.gen(function* () {
              const ctx = yield* MutationCtx;
              const id = yield* Effect.promise(() =>
                ctx.db.insert("notes", { text: "hello" }),
              );
              let evaluations = 0;
              const table = Table.make(() => {
                evaluations++;
                return Schema.Struct({ text: Schema.String });
              })
                .index("by_text", ["text"])
                .searchIndex("text", { searchField: "text" })("notes");
              const schema = DatabaseSchema.make({ notes: table });
              const reader = DatabaseReader_.make<typeof schema>(
                schema,
                ctx.db,
              ).table("notes");
              const writer = DatabaseWriter_.make<typeof schema>(
                schema,
                ctx.db,
              ).table("notes");
              const get = reader.get(id);
              const getByIndex = reader.get("by_text", "hello");
              const first = reader.index("by_text").first();
              const take = reader.index("by_text").take(1);
              const collect = reader.index("by_text").collect();
              const orderedStream = reader.index("by_text").stream();
              const paginate = reader
                .index("by_text")
                .paginate({ numItems: 1, cursor: null });
              const search = reader.search("text", (q) =>
                q.search("text", "hello"),
              );
              const stream = reader.stream("by_text");

              expect(evaluations).toBe(0);

              const encoded = yield* Effect.promise(() => ctx.db.get(id));
              const doc = table.Doc;
              const interpreted = SchemaParser.decodeUnknownEffect(doc);
              yield* interpreted(encoded);
              let calls = 0;
              SchemaCompiler.set(doc.ast, {
                decodeEffect: (input, options) => {
                  calls++;
                  return interpreted(input, options);
                },
              });

              const getResult = yield* get;
              expect(getResult).toEqual(encoded);
              const getByIndexResult = yield* getByIndex;
              expect(getByIndexResult).toEqual(encoded);
              const firstResult = yield* first;
              expect(firstResult).toEqual(Option.some(encoded));
              const takeResult = yield* take;
              expect(takeResult).toEqual([encoded]);
              const collectResult = yield* collect;
              expect(collectResult).toEqual([encoded]);
              const runCollectResult = yield* Stream.runCollect(orderedStream);
              expect(runCollectResult).toEqual([encoded]);
              expect((yield* paginate).page).toEqual([encoded]);
              const collectResult2 = yield* search.collect();
              expect(collectResult2).toEqual([encoded]);
              const runCollectResult2 = yield* Stream.runCollect(stream);
              expect(runCollectResult2).toEqual([encoded]);
              expect(
                (yield* QueryStream.paginate(stream, {
                  numItems: 1,
                  cursor: null,
                })).page,
              ).toEqual([encoded]);
              expect(calls).toBe(10);

              yield* writer.patch(id, { text: "patched" });
              expect(calls).toBe(11);
              expect(evaluations).toBe(1);
              expect(table.Doc).toBe(doc);
              expect(encoded?.text).toBe("hello");
              expect((yield* Effect.promise(() => ctx.db.get(id)))?.text).toBe(
                "patched",
              );
            }),
          );
        }),
    );

    test.effect("get", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const text = "Hello, world!";

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;

            return yield* writer.table("notes").insert({
              text,
            });
          }),
          Id("notes"),
        );

        const retrievedText = yield* c
          .query(refs.public.databaseReader.getNote, { noteId: noteId })
          .pipe(Effect.map((note) => note.text));

        assertEquals(retrievedText, text);
      }),
    );

    test.effect("collect", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;

            yield* Effect.forEach(Array.range(1, 10), (i) =>
              writer.table("notes").insert({
                text: `${i}`,
              }),
            );
          }),
        );

        const notes = yield* c.query(refs.public.databaseReader.listNotes);

        assertEquals(notes.length, 10);
        assertEquals(notes[0]?.text, "10");
        assertEquals(notes[9]?.text, "1");
      }),
    );

    test.effect("take uses Convex count validation", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        yield* c.run(
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;
            const take = (n: number) =>
              reader.table("notes").index("by_text").take(n);

            const takeResult2 = yield* take(0);
            expect(takeResult2).toEqual([]);

            for (const n of [
              2.5,
              -1,
              Number.NaN,
              Number.POSITIVE_INFINITY,
              Number.NEGATIVE_INFINITY,
            ]) {
              const error = yield* take(n).pipe(
                Effect.catchDefect(Effect.succeed),
              );
              assert.instanceOf(error, TypeError);
              expect(error.message).toBe(
                "Arg 1 `n` to `take` must be a non-negative integer",
              );
            }
          }).pipe(Effect.orDie),
        );
      }),
    );
  },
);

it.layer(TestConfect.layer, { buildPerTest: true })(
  "DatabaseWriter",
  (test) => {
    test.effect("patch unsets optional fields set to undefined", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;

            const id = yield* writer
              .table("notes")
              .insert({ text: "original", tag: "draft" });

            yield* writer
              .table("notes")
              .patch(id, { text: "patched", tag: undefined });

            return id;
          }),
          Id("notes"),
        );

        const note = yield* c.query(refs.public.databaseReader.getNote, {
          noteId,
        });

        assertEquals(note.text, "patched");
        assert.isFalse(RecordEffect.has<string, unknown>(note, "tag"));
      }),
    );

    test("patch accepts undefined according to field types and compiler optionality", () => {
      const patchNote = (writer: DatabaseWriter) => writer.table("notes").patch;
      type Patch = Parameters<ReturnType<typeof patchNote>>[1];

      expectTypeOf<{ tag: undefined }>().toExtend<Patch>();
      expectTypeOf<{ author: undefined }>().toExtend<Patch>();
      expectTypeOf<
        { text: undefined } extends Patch ? true : false
      >().toEqualTypeOf<CompilerOptions.AllowsExplicitUndefined>();
      expectTypeOf<{ text: string }>().toExtend<Patch>();
    });
  },
);

it.layer(TestConfect.layer, { buildPerTest: true })(
  "MutationRunner",
  (test) => {
    test.effect("insertNoteViaRunner", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const text = "via runner";

        const noteId = yield* c.action(
          refs.public.groups.runners.insertNoteViaRunner,
          { text },
        );

        const note = yield* c.query(refs.public.databaseReader.getNote, {
          noteId,
        });
        expectTypeOf(note).toEqualTypeOf<(typeof notes.Doc)["Type"]>();
        assertEquals(note.text, text);
      }),
    );
  },
);

it.layer(TestConfect.layer, { buildPerTest: true })("ActionRunner", (test) => {
  test.effect("getNumberViaRunner", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const result = yield* c.action(
        refs.public.groups.runners.getNumberViaRunner,
      );

      expectTypeOf(result).toEqualTypeOf<number>();
      assertEquals(typeof result, "number");
    }),
  );
});

it.layer(TestConfect.layer, { buildPerTest: true })("QueryRunner", (test) => {
  test.effect("countNotesViaRunner", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.mutation(refs.public.groups.notes.insert, { text: "one" });
      yield* c.mutation(refs.public.groups.notes.insert, { text: "two" });

      const count = yield* c.action(
        refs.public.groups.runners.countNotesViaRunner,
      );

      expectTypeOf(count).toEqualTypeOf<number>();
      assertEquals(count, 2);
    }),
  );
});

it.layer(TestConfect.layer, { buildPerTest: true })("paginate", (test) => {
  test.effect("paginate without filter", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* Effect.forEach(Array.range(1, 5), (i) =>
            writer.table("notes").insert({ text: `note ${i}` }),
          );
        }),
      );

      const result = yield* c.query(refs.public.databaseReader.paginateNotes, {
        paginationOpts: { cursor: null, numItems: 3 },
      });

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, false);

      const result2 = yield* c.query(refs.public.databaseReader.paginateNotes, {
        paginationOpts: { cursor: result.continueCursor, numItems: 3 },
      });

      assertEquals(result2.page.length, 2);
      assertEquals(result2.isDone, true);
    }),
  );

  test.effect("accepts the protocol fields Convex's client sends", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* Effect.forEach(Array.range(1, 3), (i) =>
            writer.table("notes").insert({ text: `note ${i}` }),
          );
        }),
      );

      // `usePaginatedQuery` from `convex/react` always includes `id`; the
      // composed args schema must accept it (and the other optional protocol
      // fields) for real requests to pass validation.
      const result = yield* c.query(refs.public.databaseReader.paginateNotes, {
        paginationOpts: { cursor: null, numItems: 10, id: 1 },
      });

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, true);
    }),
  );

  test.effect("paginate with filter", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* writer.table("notes").insert({ text: "a", tag: "important" });
          yield* writer.table("notes").insert({ text: "b", tag: "trivial" });
          yield* writer.table("notes").insert({ text: "c", tag: "important" });
          yield* writer.table("notes").insert({ text: "d", tag: "trivial" });
          yield* writer.table("notes").insert({ text: "e", tag: "important" });
        }),
      );

      const result = yield* c.query(
        refs.public.databaseReader.paginateNotesWithFilter,
        { paginationOpts: { cursor: null, numItems: 10 }, tag: "important" },
      );

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, true);

      const texts = new Set(Array.map(result.page, (n) => n.text));
      assertEquals(texts.has("a"), true);
      assertEquals(texts.has("c"), true);
      assertEquals(texts.has("e"), true);
    }),
  );

  test.effect("paginate with filter returns empty when no matches", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* writer.table("notes").insert({ text: "a", tag: "trivial" });
          yield* writer.table("notes").insert({ text: "b", tag: "trivial" });
        }),
      );

      const result = yield* c.query(
        refs.public.databaseReader.paginateNotesWithFilter,
        { paginationOpts: { cursor: null, numItems: 10 }, tag: "important" },
      );

      assertEquals(result.page.length, 0);
      assertEquals(result.isDone, true);
    }),
  );

  test.effect("paginate with filter paginates correctly", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* Effect.forEach(Array.range(1, 10), (i) =>
            writer
              .table("notes")
              .insert({ text: `note ${i}`, tag: i % 2 === 0 ? "even" : "odd" }),
          );
        }),
      );

      const page1 = yield* c.query(
        refs.public.databaseReader.paginateNotesWithFilter,
        { paginationOpts: { cursor: null, numItems: 2 }, tag: "even" },
      );

      assertEquals(page1.page.length, 2);

      for (const note of page1.page) {
        assertEquals(note.tag, "even");
      }
    }),
  );

  test.effect("surfaces the declared typed error", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const failure = yield* c
        .query(refs.public.databaseReader.paginateNotesOrFail, {
          paginationOpts: { cursor: null, numItems: 3 },
          shouldFail: true,
        })
        .pipe(Effect.result, Effect.map(expectFailure));

      const matchesSchema = Schema.is(PaginationDenied)(failure);
      assert(matchesSchema);
      assertEquals(failure.reason, "denied");

      const result = yield* c.query(
        refs.public.databaseReader.paginateNotesOrFail,
        {
          paginationOpts: { cursor: null, numItems: 3 },
          shouldFail: false,
        },
      );

      assertEquals(result.page.length, 0);
      assertEquals(result.isDone, true);
    }),
  );
});

const expectFailure = <A, E>(result: Result.Result<A, E>): E => {
  const isFailure2 = Result.isFailure(result);
  assert(isFailure2);
  return result.failure;
};

// Insert a note then immediately delete it to obtain a well-formed Convex id
// that no longer points at any document. Convex's argument validators reject
// arbitrary strings when the spec declares Id<"notes">.
const insertAndDeleteNote = Effect.gen(function* () {
  const c = yield* TestConfect.TestConfect;
  return yield* c.run(
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const id = yield* writer.table("notes").insert({ text: "transient" });
      yield* writer.table("notes").delete(id);
      return id;
    }),
    Id("notes"),
  );
}).pipe(Effect.orDie);

it.layer(TestConfect.layer, { buildPerTest: true })("typed errors", (test) => {
  describe("server-side encoding", () => {
    test.effect("query handler typed error surfaces as the typed error", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* Effect.result(
          c.query(refs.public.groups.typedErrors.getNoteOrFail, {
            noteId: missingId,
          }),
        );

        const error = expectFailure(result);
        const matchesSchema2 = Schema.is(NotFound)(error);
        assert(matchesSchema2);
        expect(error.id).toBe(missingId);
      }),
    );

    test.effect(
      "mutation handler typed error (NotFound) surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: true,
            }),
          );

          const error = expectFailure(result);
          const matchesSchema3 = Schema.is(NotFound)(error);
          assert(matchesSchema3);
          expect(error.id).toBe(missingId);
        }),
    );

    test.effect(
      "mutation handler typed error (Forbidden) surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: false,
            }),
          );

          const error = expectFailure(result);
          const matchesSchema4 = Schema.is(Forbidden)(error);
          assert(matchesSchema4);
          expect(error.reason).toBe("admin required");
        }),
    );

    test.effect("action handler typed error surfaces as the typed error", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* Effect.result(
          c.action(refs.public.groups.typedErrors.failingAction, {
            kind: "forbidden",
          }),
        );

        const error = expectFailure(result);
        const matchesSchema5 = Schema.is(Forbidden)(error);
        assert(matchesSchema5);
        expect(error.reason).toBe("no access");
      }),
    );
  });

  describe("runner decoding", () => {
    test.effect("QueryRunner decodes nested typed error to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* c.query(
          refs.public.groups.typedErrors.tryGetNote,
          { noteId: missingId },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: missingId });
      }),
    );

    test.effect("QueryRunner Ok path: returns the decoded note text", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("notes").insert({ text: "hello" });
          }),
          Id("notes"),
        );

        const result = yield* c.query(
          refs.public.groups.typedErrors.tryGetNote,
          { noteId },
        );

        expect(result).toStrictEqual({ _tag: "Ok", text: "hello" });
      }),
    );

    test.effect("MutationRunner decodes NotFound to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId: missingId, asAdmin: true },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: missingId });
      }),
    );

    test.effect("MutationRunner decodes Forbidden to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId: missingId, asAdmin: false },
        );

        expect(result).toStrictEqual({
          _tag: "Forbidden",
          reason: "admin required",
        });
      }),
    );

    test.effect("MutationRunner Ok path: deletes the existing note", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("notes").insert({ text: "to delete" });
          }),
          Id("notes"),
        );

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId, asAdmin: true },
        );

        expect(result).toStrictEqual({ _tag: "Ok" });

        const remaining = yield* c.query(refs.public.databaseReader.listNotes);
        assertEquals(remaining.length, 0);
      }),
    );

    test.effect("ActionRunner decodes NotFound to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryFailingAction,
          { kind: "notFound" },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: "missing" });
      }),
    );

    test.effect("ActionRunner decodes Forbidden to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryFailingAction,
          { kind: "forbidden" },
        );

        expect(result).toStrictEqual({
          _tag: "Forbidden",
          reason: "no access",
        });
      }),
    );
  });

  describe("round-trip identity", () => {
    test.effect(
      "decoded error data round-trips into the original TaggedError class",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const queryResult = yield* Effect.result(
            c.query(refs.public.groups.typedErrors.getNoteOrFail, {
              noteId: missingId,
            }),
          );
          const notFound = expectFailure(queryResult);
          const matchesSchema6 = Schema.is(NotFound)(notFound);
          assert(matchesSchema6);
          expect(notFound.id).toBe(missingId);

          const mutationResult = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: false,
            }),
          );
          const forbidden = expectFailure(mutationResult);
          const matchesSchema7 = Schema.is(Forbidden)(forbidden);
          assert(matchesSchema7);
          expect(forbidden.reason).toBe("admin required");
        }),
    );
  });

  describe("mutation rollback", () => {
    test.effect(
      "throwing typed error from a mutation rolls back inserted rows",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.insertThenFail, {
              text: "should not persist",
            }),
          );

          const error = expectFailure(result);
          const matchesSchema8 = Schema.is(NotFound)(error);
          assert(matchesSchema8);
          expect(error.id).toBe("rolled-back");

          const notes = yield* c.query(refs.public.databaseReader.listNotes);
          assertEquals(notes.length, 0);
        }),
    );
  });

  describe("internal visibility", () => {
    test.effect(
      "QueryRunner decodes a typed error from an internal query into the typed E channel",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* c.action(
            refs.public.groups.typedErrors.tryInternalGetNote,
            { noteId: missingId },
          );

          expect(result).toStrictEqual({ _tag: "NotFound", id: missingId });
        }),
    );
  });

  describe("node action", () => {
    test.effect(
      "typed error from a publicNodeAction surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.action(refs.public.typedErrorsNode.failingNodeAction, {
              id: "abc",
            }),
          );

          const error = expectFailure(result);
          const matchesSchema9 = Schema.is(NodeNotFound)(error);
          assert(matchesSchema9);
          expect(error.id).toBe("abc");
        }),
    );
  });
});
