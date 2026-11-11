import * as Layer from "effect/Layer";
import { GenericId, Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as LocalBackend from "confect-local-backend/LocalBackend";
import refs from "confect-local-backend/refs";

layer(LocalBackend.layer, { timeout: "120 seconds" })("HttpRouter", (it) => {
  it.effect(
    "runs filtered vector searches from plain routes and HttpApi endpoints",
    () =>
      Effect.gen(function* () {
        const { client } = yield* LocalBackend.LocalBackend;
        const caseId = "http-vector-search";
        const ids = yield* Ref.runWithCodec(
          refs.public.groups.httpVectors.seed,
          { caseId },
          (ref, args) => client.mutation(ref, args),
        );
        const services = yield* Layer.build(FetchHttpClient.layer);
        return yield* Effect.gen(function* () {
          for (const path of ["/vector-search", "/api/vector-search"]) {
            for (const filter of [caseId, `${caseId}-missing`, caseId]) {
              const response = yield* HttpClient.get(
                `http://127.0.0.1:3211${path}?caseId=${filter}`,
              );
              expect(response.status).toBe(200);
              const matches = yield* response.json.pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(
                    Schema.Array(
                      Schema.Struct({
                        _id: GenericId.GenericId("httpVectors"),
                        _score: Schema.Finite,
                      }),
                    ),
                  ),
                ),
              );
              if (filter !== caseId) {
                expect(matches).toEqual([]);
              } else {
                expect(Array.map(matches, (match) => match._id)).toEqual(ids);
                expect(matches[0]?._score).toBeCloseTo(1);
                expect(matches[1]?._score).toBeCloseTo(0);
              }
            }
          }
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped),
  );

  it.effect("streams a 100 MiB response through the Effect router", () =>
    Effect.gen(function* () {
      const services = yield* Layer.build(FetchHttpClient.layer);
      return yield* Effect.gen(function* () {
        yield* LocalBackend.LocalBackend;
        const response = yield* HttpClient.get(
          "http://127.0.0.1:3211/large-stream",
        );

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toBe(
          "application/octet-stream",
        );
        const bytes = yield* response.stream.pipe(
          Stream.runFold(
            () => 0,
            (total, chunk) => {
              expect(chunk.every((byte) => byte === 120)).toBe(true);
              return total + chunk.byteLength;
            },
          ),
        );
        expect(bytes).toBe(100 * 1024 * 1024);
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped),
  );
});
