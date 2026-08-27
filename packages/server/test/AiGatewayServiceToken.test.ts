import { AiGatewayClient } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { make as makeAiGatewayServiceToken } from "../src/internal/AiGatewayServiceToken";

const CONVEX_AI_GATEWAY_DISABLED_MESSAGE =
  "The Convex AI gateway is not enabled for your team. Upgrade to a paid plan to enable it, or contact support@convex.dev if you believe this is an error.";

const CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE =
  '`getServiceToken("ai-gateway")` isn\'t available on this deployment because the AI gateway is a Convex Cloud service. Deploy to Convex Cloud, or call your model provider directly with your own API key.';

describe("AiGatewayServiceToken", () => {
  it.effect("maps a disabled gateway in the default runtime", () =>
    Effect.gen(function* () {
      const error = yield* getServiceTokenError(
        new Error(CONVEX_AI_GATEWAY_DISABLED_MESSAGE),
      );

      assert.instanceOf(error, AiGatewayClient.AiGatewayDisabled);
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

      assert.instanceOf(error, AiGatewayClient.AiGatewayDisabled);
    }),
  );

  it.effect("maps an unavailable gateway in the default runtime", () =>
    Effect.gen(function* () {
      const error = yield* getServiceTokenError(
        new Error(CONVEX_AI_GATEWAY_UNAVAILABLE_MESSAGE),
      );

      assert.instanceOf(error, AiGatewayClient.AiGatewayUnavailable);
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

      assert.instanceOf(error, AiGatewayClient.AiGatewayUnavailable);
    }),
  );

  it.effect("treats unexpected rejections as defects", () =>
    Effect.gen(function* () {
      const unexpected = new Error(
        "NotAiGatewayDisabled is not a documented error code",
      );
      const serviceToken = makeAiGatewayServiceToken(() =>
        Promise.reject(unexpected),
      );

      const exit = yield* serviceToken.get("ai-gateway").pipe(Effect.exit);

      assert.deepStrictEqual(exit, Exit.die(unexpected));
    }),
  );
});

const getServiceTokenError = (rejection: unknown) =>
  makeAiGatewayServiceToken(() => Promise.reject(rejection))
    .get("ai-gateway")
    .pipe(Effect.flip);

const nodeActionCallbackError = (
  prefix: string,
  code: "AiGatewayDisabled" | "AiGatewayUnavailable",
  message: string,
): Error => new Error(`${prefix}: ${JSON.stringify({ code, message })}`);
