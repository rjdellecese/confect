/**
 * End-to-end test that `first` and `take(n)` fetch no more documents than they
 * return, read from the local backend's index-range metrics.
 */

import { Ref } from "@confect/core";
import { assert, expect, layer } from "@effect/vitest";
import type { ConvexHttpClient } from "convex/browser";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

const functions = refs.public.groups.orderedQuery;

const histogramSum = (metrics: ReadonlyArray<string>, name: string) => {
  const prefix = `convex_local_backend_${name}_sum `;
  const sample = metrics.find((metric) => metric.startsWith(prefix));
  assert.isDefined(sample, `the local backend reports ${name}`);
  return Number(sample.slice(prefix.length));
};

const readCounts = (client: ConvexHttpClient) =>
  HttpClient.get(new URL("/metrics", client.url)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text),
    Effect.map((text) => {
      const metrics = text.split("\n");
      return {
        returned: histogramSum(metrics, "udf_query_used_results_total"),
        unread: histogramSum(metrics, "udf_query_unused_results_total"),
      };
    }),
    Effect.orDie,
  );

// The backend records an index range's counts when it closes, so wait for them.
const unreadDocuments = Effect.fnUntraced(function* (
  client: ConvexHttpClient,
  query: () => Promise<ReadonlyArray<number> | number | null>,
) {
  const before = yield* readCounts(client);
  const result = yield* Effect.promise(query);
  const returned = Array.isArray(result)
    ? result.length
    : result === null
      ? 0
      : 1;
  const after = yield* readCounts(client).pipe(
    Effect.repeat({
      until: (counts) => counts.returned - before.returned >= returned,
      schedule: Schedule.spaced("50 millis"),
      times: 100,
    }),
  );
  expect(after.returned - before.returned).toBeGreaterThanOrEqual(returned);
  return { result, unread: after.unread - before.unread };
});

layer(Layer.mergeAll(LocalBackend.layer, FetchHttpClient.layer), {
  timeout: "120 seconds",
  excludeTestServices: true,
})("Ordered query reads", (it) => {
  it.effect("first and take(n) fetch only the documents they return", () =>
    Effect.gen(function* () {
      const { client } = yield* LocalBackend.LocalBackend;
      const caseId = "bounded-reads";
      yield* Effect.promise(() =>
        client.mutation(Ref.getFunctionReference(functions.seed), {
          caseId,
          count: 150,
        }),
      );
      const positions = (count: number) =>
        Array.from({ length: count }, (_, position) => position);

      expect(
        yield* unreadDocuments(client, () =>
          client.query(Ref.getFunctionReference(functions.first), { caseId }),
        ),
      ).toEqual({ result: 0, unread: 0 });
      for (const n of [5, 101]) {
        expect(
          yield* unreadDocuments(client, () =>
            client.query(Ref.getFunctionReference(functions.take), {
              caseId,
              n,
            }),
          ),
        ).toEqual({ result: positions(n), unread: 0 });
      }
    }),
  );
});
