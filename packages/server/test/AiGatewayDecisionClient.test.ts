import { AiGatewayClient, AiGatewayDecisionClient } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import type * as ConvexServer from "convex/server";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { vi } from "vitest";

const { getServiceToken } = vi.hoisted(() => ({ getServiceToken: vi.fn() }));

vi.mock("convex/server", (importOriginal) =>
  importOriginal<typeof ConvexServer>().then((original) => ({
    ...original,
    getServiceToken,
  })),
);

describe("AiGatewayDecisionClient", () => {
  for (const [name, make] of [
    ["make", AiGatewayDecisionClient.make],
    [
      "layer",
      Effect.service(AiGatewayDecisionClient.AiGatewayDecisionClient).pipe(
        Effect.provide(AiGatewayDecisionClient.layer),
      ),
    ],
  ] as const) {
    it.effect(`${name} acquires a token once and authenticates decisions`, () =>
      Effect.gen(function* () {
        getServiceToken.mockReset().mockResolvedValue("test-token");
        let requests = 0;
        const client = yield* make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                requests++;
                assert.strictEqual(
                  request.url,
                  "https://ai-gateway.convex.dev/alpha/decisions",
                );
                assert.strictEqual(
                  request.headers.authorization,
                  "Bearer test-token",
                );
                return HttpClientResponse.fromWeb(
                  request,
                  Response.json({
                    model: "typesafe/jev-1.13",
                    answers: { urgent: { type: "noul", noul: 0.9 } },
                    usage: { input_tokens: 10, output_tokens: 1 },
                  }),
                );
              }),
            ),
          ),
        );
        const payload = {
          model: "typesafe/jev-1.13",
          state: "Help",
          questions: {
            urgent: { type: "noul" as const, instructions: "Is it urgent?" },
          },
        };
        yield* client.createDecisions(payload);
        yield* client.createDecisions(payload);
        assert.strictEqual(requests, 2);
        assert.strictEqual(getServiceToken.mock.calls.length, 1);
        assert.deepStrictEqual(getServiceToken.mock.calls[0], ["ai-gateway"]);
      }),
    );

    for (const ErrorType of [
      AiGatewayDecisionClient.AiGatewayDisabled,
      AiGatewayDecisionClient.AiGatewayUnavailable,
    ]) {
      it.effect(`${name} preserves ${ErrorType.name} before HTTP`, () =>
        Effect.gen(function* () {
          getServiceToken
            .mockReset()
            .mockRejectedValue({ code: new ErrorType()._tag });
          const error = yield* make.pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.make(() => Effect.die("Unexpected HTTP request")),
            ),
            Effect.flip,
          );
          assert.strictEqual(error._tag, new ErrorType()._tag);
        }),
      );
    }
  }

  it("shares the existing gateway error types", () => {
    assert.strictEqual(
      AiGatewayDecisionClient.AiGatewayDisabled,
      AiGatewayClient.AiGatewayDisabled,
    );
    assert.strictEqual(
      AiGatewayDecisionClient.AiGatewayUnavailable,
      AiGatewayClient.AiGatewayUnavailable,
    );
  });
});
