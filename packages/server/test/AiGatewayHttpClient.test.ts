import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { withServiceToken } from "../src/internal/AiGatewayHttpClient";
import {
  AiGatewayDisabled,
  AiGatewayUnavailable,
} from "../src/internal/AiGatewayServiceToken";

describe("AiGatewayHttpClient", () => {
  it.effect(
    "looks up a token for each concurrent request without mutating inputs",
    () =>
      Effect.gen(function* () {
        let tokenCalls = 0;
        const tokens = new Set<string | undefined>();
        const client = HttpClient.make((request) =>
          Effect.sync(() => {
            tokens.add(request.headers.authorization);
            return HttpClientResponse.fromWeb(request, new Response());
          }),
        ).pipe(
          withServiceToken({
            get: () => Effect.sync(() => `token-${++tokenCalls}`),
          }),
        );
        const request = HttpClientRequest.get(
          "https://ai-gateway.convex.dev/v1/models",
        ).pipe(
          HttpClientRequest.setHeader("authorization", "Bearer stale-token"),
        );

        yield* Effect.all([client.execute(request), client.execute(request)], {
          concurrency: "unbounded",
        });

        assert.strictEqual(tokenCalls, 2);
        assert.deepStrictEqual(
          tokens,
          new Set(["Bearer token-1", "Bearer token-2"]),
        );
        assert.strictEqual(request.headers.authorization, "Bearer stale-token");
      }),
  );

  it.effect.each([
    { name: "AiGatewayDisabled", ErrorType: AiGatewayDisabled },
    { name: "AiGatewayUnavailable", ErrorType: AiGatewayUnavailable },
  ])(
    "preserves $name as the HTTP failure cause without sending",
    ({ ErrorType }) =>
      Effect.gen(function* () {
        const cause = new ErrorType();
        const client = HttpClient.make(() =>
          Effect.die("Unexpected HTTP request"),
        ).pipe(withServiceToken({ get: () => Effect.fail(cause) }));
        const error = yield* client
          .get("https://ai-gateway.convex.dev/v1/models")
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "HttpClientError");
        assert.strictEqual(error.reason._tag, "TransportError");
        if (error.reason._tag !== "TransportError") {
          return;
        }
        assert.strictEqual(error.reason.cause, cause);
        assert.strictEqual(error.reason.description, cause.message);
      }),
  );

  it.effect("keeps unexpected token failures as defects", () =>
    Effect.gen(function* () {
      const defect = new Error("Unexpected token failure");
      const client = HttpClient.make(() =>
        Effect.die("Unexpected HTTP request"),
      ).pipe(withServiceToken({ get: () => Effect.die(defect) }));
      const exit = yield* client
        .get("https://ai-gateway.convex.dev/v1/models")
        .pipe(Effect.exit);

      assert.deepStrictEqual(exit, Exit.die(defect));
    }),
  );
});
