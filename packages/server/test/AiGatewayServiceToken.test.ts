import { AiGatewayLanguageClient } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as AiGatewayServiceToken from "../src/internal/AiGatewayServiceToken";

const CONVEX_AI_GATEWAY_DISABLED_MESSAGE =
  "The Convex AI gateway is not enabled for your team. Upgrade to a paid plan to enable it, or contact support@convex.dev if you believe this is an error.";

const CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE =
  '`getServiceToken("ai-gateway")` isn\'t available on this deployment because the AI gateway is a Convex Cloud service. Deploy to Convex Cloud, or call your model provider directly with your own API key.';

describe("AiGatewayServiceToken", () => {
  it("exposes a schema for service-token failures", () => {
    const isAiGatewayError = Schema.is(AiGatewayLanguageClient.AiGatewayError);

    assert.isTrue(
      isAiGatewayError(new AiGatewayLanguageClient.AiGatewayDisabled()),
    );
    assert.isTrue(
      isAiGatewayError(new AiGatewayLanguageClient.AiGatewayUnavailable()),
    );
    assert.isFalse(isAiGatewayError(new Error("unexpected")));
  });

  it.effect("maps a disabled gateway in the default runtime", () =>
    Effect.gen(function* () {
      const error = yield* getServiceTokenError(
        new Error(CONVEX_AI_GATEWAY_DISABLED_MESSAGE),
      );

      assert.instanceOf(error, AiGatewayLanguageClient.AiGatewayDisabled);
      assert.strictEqual(
        error.message,
        "The Convex AI gateway is disabled. Your team may be on the free plan, or the gateway may have been disabled for your team. Upgrade to a paid plan, or email support@convex.dev if this looks wrong.",
      );
    }),
  );

  it.effect("maps a disabled gateway in the Node runtime", () =>
    Effect.gen(function* () {
      const error = yield* getServiceTokenError(
        nodeActionCallbackError(
          "Transient error while running create service token",
          "AiGatewayDisabled",
          CONVEX_AI_GATEWAY_DISABLED_MESSAGE,
        ),
      );

      assert.instanceOf(error, AiGatewayLanguageClient.AiGatewayDisabled);
    }),
  );

  it.effect("maps an unavailable gateway in the default runtime", () =>
    Effect.gen(function* () {
      const error = yield* getServiceTokenError(
        new Error(CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE),
      );

      assert.instanceOf(error, AiGatewayLanguageClient.AiGatewayUnavailable);
      assert.strictEqual(
        error.message,
        "The Convex AI gateway is unavailable. This action is running on a local or self-hosted deployment, which cannot use the gateway. Call the model provider directly with your own API key stored in a Convex environment variable.",
      );
    }),
  );

  it.effect("maps an unavailable gateway in the Node runtime", () =>
    Effect.gen(function* () {
      const error = yield* getServiceTokenError(
        nodeActionCallbackError(
          "Invalid create service token request",
          "AiGatewayUnavailable",
          CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE,
        ),
      );

      assert.instanceOf(error, AiGatewayLanguageClient.AiGatewayUnavailable);
    }),
  );

  it.effect("treats unexpected rejections as defects", () =>
    Effect.gen(function* () {
      const unexpected = new Error(
        "NotAiGatewayDisabled is not a documented error code",
      );
      const serviceToken = AiGatewayServiceToken.make(() =>
        Promise.reject(unexpected),
      );

      const exit = yield* serviceToken.get("ai-gateway").pipe(Effect.exit);

      assert.deepStrictEqual(exit, Exit.die(unexpected));
    }),
  );

  describe("transformClientRequest", () => {
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
            AiGatewayServiceToken.transformClientRequest({
              get: () => Effect.sync(() => `token-${++tokenCalls}`),
            }),
          );
          const request = HttpClientRequest.get(
            "https://ai-gateway.convex.dev/v1/models",
          ).pipe(
            HttpClientRequest.setHeader("authorization", "Bearer stale-token"),
          );

          yield* Effect.all(
            [client.execute(request), client.execute(request)],
            {
              concurrency: "unbounded",
            },
          );

          assert.strictEqual(tokenCalls, 2);
          assert.deepStrictEqual(
            tokens,
            new Set(["Bearer token-1", "Bearer token-2"]),
          );
          assert.strictEqual(
            request.headers.authorization,
            "Bearer stale-token",
          );
        }),
    );

    it.effect.each([
      {
        name: "AiGatewayDisabled",
        ErrorType: AiGatewayServiceToken.AiGatewayDisabled,
      },
      {
        name: "AiGatewayUnavailable",
        ErrorType: AiGatewayServiceToken.AiGatewayUnavailable,
      },
    ])(
      "preserves $name as the HTTP failure cause without sending",
      ({ ErrorType }) =>
        Effect.gen(function* () {
          const cause = new ErrorType();
          const client = HttpClient.make(() =>
            Effect.die("Unexpected HTTP request"),
          ).pipe(
            AiGatewayServiceToken.transformClientRequest({
              get: () => Effect.fail(cause),
            }),
          );
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
        ).pipe(
          AiGatewayServiceToken.transformClientRequest({
            get: () => Effect.die(defect),
          }),
        );
        const exit = yield* client
          .get("https://ai-gateway.convex.dev/v1/models")
          .pipe(Effect.exit);

        assert.deepStrictEqual(exit, Exit.die(defect));
      }),
    );
  });
});

const getServiceTokenError = (rejection: Error) =>
  AiGatewayServiceToken.make(() => Promise.reject(rejection))
    .get("ai-gateway")
    .pipe(Effect.flip);

const nodeActionCallbackError = (
  prefix: string,
  code: "AiGatewayDisabled" | "AiGatewayUnavailable",
  message: string,
): Error => new Error(`${prefix}: ${JSON.stringify({ code, message })}`);
