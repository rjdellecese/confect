import { describe, expect, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import * as Storage from "@confect/server/Storage";
import { StorageReader } from "@confect/server/StorageReader";
import { convexTest } from "convex-test";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { vi } from "vitest";
import {
  DatabaseWriter,
  VectorSearch,
} from "./fixtures/confect/_generated/services";
import databaseSchema from "./fixtures/confect/_generated/schema";
import { Id } from "./fixtures/confect/_generated/id";
import { NotesApi } from "./fixtures/confect/http";
import * as TestConfect from "./TestConfect";
import convexSchema from "./fixtures/confect/_generated/convexSchema";

it.layer(TestConfect.layer, { buildPerTest: true })("HttpRouter", (test) => {
  test.effect("binds vector search to each request's native context", () =>
    Effect.gen(function* () {
      const http = ConfectHttpRouter.make(
        databaseSchema,
        HttpRouter.add(
          "GET",
          "/search",
          Effect.gen(function* () {
            const search = yield* VectorSearch;
            const matches = yield* search("notes", "embedding", {
              vector: [1, ...Array<number>(1535).fill(0)],
            });
            return yield* HttpServerResponse.json(matches);
          }),
        ),
      );
      const endpoint = http.lookup("/search", "GET");
      expect(endpoint).not.toBeNull();
      if (endpoint === null) return;
      const action = endpoint[0] as (typeof endpoint)[0] & {
        _handler: <Model extends GenericDataModel>(
          ctx: GenericActionCtx<Model>,
          request: Request,
        ) => Promise<Response>;
      };
      const t = convexTest(
        convexSchema,
        import.meta.glob("./fixtures/convex/_generated/*.js"),
      );
      const calls: number[] = [];
      const services = yield* Effect.context<never>();
      yield* Effect.forEach(
        [1, 2],
        (requestId) =>
          Effect.promise(() =>
            t.action((ctx) =>
              Effect.gen(function* () {
                const actionCtx: typeof ctx = {
                  ...ctx,
                  vectorSearch(table, index, query) {
                    expect(this).toBe(actionCtx);
                    calls.push(requestId);
                    return ctx.vectorSearch(table, index, query);
                  },
                };
                const response = yield* Effect.promise(() =>
                  action._handler(
                    actionCtx,
                    new Request("https://example.test/search"),
                  ),
                );
                expect(response.status).toBe(200);
                const matches = yield* Effect.promise(() => response.json());
                expect(matches).toEqual([]);
              }).pipe(Effect.runPromiseWith(services)),
            ),
          ),
        { concurrency: "unbounded" },
      );
      expect(calls).toHaveLength(2);
      expect(calls).toEqual(expect.arrayContaining([1, 2]));
    }),
  );

  test.effect(
    "provides filtered vector search to plain routes, HttpApi handlers, and middleware",
    () =>
      Effect.gen(function* () {
        const vector = [1, ...Array<number>(1535).fill(0)];
        const resultsSchema = Schema.Array(
          Schema.Struct({ _id: Id("notes"), _score: Schema.Finite }),
        );
        const querySchema = Schema.Struct({ tag: Schema.String });
        const search = Effect.fn("http.searchNotes")(function* (tag: string) {
          const vectorSearch = yield* VectorSearch;
          return yield* vectorSearch("notes", "embedding", {
            vector,
            limit: 10,
            filter: (q) => q.eq("tag", tag),
          });
        });
        class SearchApi extends HttpApi.make("SearchApi").add(
          HttpApiGroup.make("search").add(
            HttpApiEndpoint.get("notes", "/api/vector-search", {
              query: querySchema,
              success: resultsSchema,
            }),
          ),
        ) {}
        const handlers = HttpApiBuilder.group(SearchApi, "search", (group) =>
          group.handle("notes", ({ query }) => search(query.tag)),
        );
        const http = ConfectHttpRouter.make(
          databaseSchema,
          Layer.mergeAll(
            HttpRouter.add(
              "GET",
              "/vector-search",
              Effect.gen(function* () {
                const { tag } =
                  yield* HttpServerRequest.schemaSearchParams(querySchema);
                const matches = yield* search(tag);
                return yield* HttpServerResponse.json(matches);
              }),
            ),
            HttpApiBuilder.layer(SearchApi).pipe(Layer.provide(handlers)),
            HttpRouter.middleware(
              (app) =>
                Effect.gen(function* () {
                  const request = yield* HttpServerRequest.HttpServerRequest;
                  const tag =
                    new URL(request.url, "http://localhost").searchParams.get(
                      "tag",
                    ) ?? "";
                  const matches = yield* search(tag);
                  const response = yield* app;
                  return HttpServerResponse.setHeader(
                    response,
                    "x-vector-matches",
                    String(matches.length),
                  );
                }),
              { global: true },
            ),
          ),
        );
        const t = convexTest(convexSchema, {
          ...import.meta.glob("./fixtures/convex/_generated/*.js"),
          "./fixtures/convex/http.ts": () => Promise.resolve({ default: http }),
        });
        for (const path of ["/vector-search", "/api/vector-search"]) {
          const response = yield* Effect.promise(() =>
            t.fetch(`${path}?tag=alpha`),
          );
          expect(response.status).toBe(200);
          expect(response.headers.get("x-vector-matches")).toBe("0");
          const matches = yield* Effect.promise(() => response.json());
          expect(matches).toEqual([]);
        }
        const alpha = yield* Effect.promise(() =>
          t.run((ctx) =>
            ctx.db.insert("notes", {
              text: "alpha",
              tag: "alpha",
              embedding: vector,
            }),
          ),
        );
        const beta = yield* Effect.promise(() =>
          t.run((ctx) =>
            ctx.db.insert("notes", {
              text: "beta",
              tag: "beta",
              embedding: vector,
            }),
          ),
        );
        const ids = { alpha, beta };
        for (const path of ["/vector-search", "/api/vector-search"]) {
          for (const tag of ["alpha", "beta", "missing", "alpha"] as const) {
            const response = yield* Effect.promise(() =>
              t.fetch(`${path}?tag=${tag}`),
            );
            expect(response.status).toBe(200);
            const matches = yield* Effect.promise(() => response.json()).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(resultsSchema)),
            );
            expect(response.headers.get("x-vector-matches")).toBe(
              String(matches.length),
            );
            if (tag === "missing") {
              expect(matches).toEqual([]);
            } else {
              expect(matches).toHaveLength(1);
              expect(matches[0]?._id).toBe(ids[tag]);
              expect(matches[0]?._score).toBeCloseTo(1);
            }
          }
        }
      }),
  );

  test.effect(
    "provides unified storage and both writer capabilities to HTTP handlers",
    () =>
      Effect.gen(function* () {
        const http = ConfectHttpRouter.make(
          databaseSchema,
          HttpRouter.add(
            "GET",
            "/storage",
            Effect.gen(function* () {
              const storage = yield* Storage.Storage;
              const legacy = yield* StorageReader;
              const generateUploadUrlResult = yield* storage.generateUploadUrl;
              expect(generateUploadUrlResult).toBeInstanceOf(URL);
              const id = yield* storage.store(new Blob(["HTTP storage"]));
              expect((yield* storage.getUrl(id)).href).toBe(
                (yield* legacy.getUrl(id)).href,
              );
              const blob = yield* storage.get(id);
              const contents = yield* Effect.promise(() => blob.text());
              yield* storage.delete(id);
              expect((yield* Effect.flip(storage.get(id))).id).toBe(id);
              return HttpServerResponse.text(contents);
            }).pipe(Effect.orDie),
          ),
        );
        const t = convexTest(convexSchema, {
          ...import.meta.glob("./fixtures/convex/_generated/*.js"),
          "./fixtures/convex/http.ts": () => Promise.resolve({ default: http }),
        });
        const response = yield* Effect.promise(() => t.fetch("/storage"));
        expect(response.status).toBe(200);
        const promiseResult = yield* Effect.promise(() => response.text());
        expect(promiseResult).toBe("HTTP storage");
      }),
  );

  test.effect(
    "uses each request's console and respects route logger overrides",
    () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const original = globalThis.console;
        const first = { ...original, warn: vi.fn(), log: vi.fn() };
        const second = { ...original, warn: vi.fn(), log: vi.fn() };
        yield* Effect.gen(function* () {
          globalThis.console = first;
          expect((yield* c.fetch("/logging")).status).toBe(200);
          globalThis.console = second;
          expect((yield* c.fetch("/logging")).status).toBe(200);
          expect((yield* c.fetch("/logging/disabled")).status).toBe(200);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              globalThis.console = original;
            }),
          ),
        );
        for (const console of [first, second]) {
          expect(console.warn).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ level: "WARN", message: "HTTP request" }),
          );
          expect(console.log).not.toHaveBeenCalled();
        }
      }),
  );

  test.effect(
    "serves an HttpApi endpoint whose handler uses a Confect service",
    () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const text = "Hello, HTTP!";

        yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;

            return yield* writer.table("notes").insert({ text });
          }),
          Id("notes"),
        );

        const response = yield* c.fetch("/api/notes");
        assertEquals(response.status, 200);

        const body = (yield* Effect.promise(() => response.json())) as Array<{
          text: string;
        }>;
        assertEquals(body.length, 1);
        assertEquals(body[0]?.text, text);
      }),
  );

  test.effect("serves a second HttpApi merged onto the same router", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/meta/ping");
      assertEquals(response.status, 200);
      const promiseResult2 = yield* Effect.promise(() => response.json());
      assertEquals(promiseResult2, "pong");
    }),
  );

  test.effect("serves a plain HttpRouter.add route", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/health");
      assertEquals(response.status, 200);
      const promiseResult3 = yield* Effect.promise(() => response.text());
      assertEquals(promiseResult3, "OK");
    }),
  );

  test.effect("global middleware modifies responses", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/health");
      assertEquals(response.headers.get("x-confect-middleware"), "applied");
    }),
  );

  test.effect("serves the Scalar docs page", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/api/docs");
      assertEquals(response.status, 200);
      expect(response.headers.get("content-type")).toContain("text/html");
    }),
  );

  test.effect(
    "a plain Convex route on the returned router shadows the catch-all",
    () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const response = yield* c.fetch("/convex-native");
        assertEquals(response.status, 200);
        const promiseResult4 = yield* Effect.promise(() => response.text());
        assertEquals(promiseResult4, "native");
        // The Effect router (and so its global middleware) never ran.
        assertEquals(response.headers.get("x-confect-middleware"), null);
      }),
  );

  test.effect("unmatched paths get the Effect router's 404", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/no-such-route");
      assertEquals(response.status, 404);
    }),
  );
});

describe("HttpRouter.make type-level guarantees", () => {
  it("rejects a routes layer whose group handlers are not provided", () => {
    // HttpApiBuilder.layer(NotesApi) still requires the NotesApi group handler
    // services; without Layer.provide(NotesApiLive) the layer does not satisfy
    // Routes.
    const _missingGroupLayerIsRejected = () =>
      // @ts-expect-error
      // @effect-diagnostics-next-line missingLayerContext:off
      ConfectHttpRouter.make(databaseSchema, HttpApiBuilder.layer(NotesApi));

    expect(_missingGroupLayerIsRejected).toBeDefined();
  });
});
