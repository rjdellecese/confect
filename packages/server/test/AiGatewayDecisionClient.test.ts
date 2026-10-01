import {
  AiGatewayLanguageClient,
  AiGatewayDecisionClient,
} from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import type * as ConvexServer from "convex/server";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { vi } from "vitest";

const { getServiceToken } = vi.hoisted(() => ({ getServiceToken: vi.fn() }));

vi.mock("convex/server", (importOriginal) =>
  importOriginal<typeof ConvexServer>().then((original) => ({
    ...original,
    getServiceToken,
  })),
);

describe("AiGatewayDecisionClient", () => {
  describe.each([
    ["make", AiGatewayDecisionClient.make],
    [
      "layer",
      Effect.service(AiGatewayDecisionClient.AiGatewayDecisionClient).pipe(
        Effect.provide(AiGatewayDecisionClient.layer),
      ),
    ],
  ] as const)("%s", (_name, make) => {
    it.effect("acquires a token once and authenticates decisions", () =>
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
        assert.strictEqual(getServiceToken.mock.calls.length, 3);
        assert.deepStrictEqual(getServiceToken.mock.calls[0], ["ai-gateway"]);
      }),
    );

    it.effect("uses refreshed credentials for subsequent decisions", () =>
      Effect.gen(function* () {
        getServiceToken
          .mockReset()
          .mockResolvedValueOnce("construction-token")
          .mockResolvedValueOnce("first-request-token")
          .mockResolvedValueOnce("refreshed-token");
        const authorizations: Array<string | undefined> = [];
        const client = yield* make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                authorizations.push(request.headers.authorization);
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

        assert.deepStrictEqual(authorizations, [
          "Bearer first-request-token",
          "Bearer refreshed-token",
        ]);
        assert.deepStrictEqual(getServiceToken.mock.calls, [
          ["ai-gateway"],
          ["ai-gateway"],
          ["ai-gateway"],
        ]);
      }),
    );

    it.effect.each([
      {
        name: "AiGatewayDisabled",
        ErrorType: AiGatewayDecisionClient.AiGatewayDisabled,
      },
      {
        name: "AiGatewayUnavailable",
        ErrorType: AiGatewayDecisionClient.AiGatewayUnavailable,
      },
    ])("reports request-time $name as an AI error", ({ ErrorType }) =>
      Effect.gen(function* () {
        getServiceToken
          .mockReset()
          .mockResolvedValueOnce("construction-token")
          .mockRejectedValueOnce({ code: new ErrorType()._tag });
        const client = yield* make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("Unexpected HTTP request")),
          ),
        );
        const error = yield* client
          .createDecisions({
            model: "typesafe/jev-1.13",
            state: "Help",
            questions: {},
          })
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "AiError");
        assert.strictEqual(error.reason._tag, "NetworkError");
        if (error.reason._tag !== "NetworkError") {
          return;
        }
        assert.strictEqual(error.reason.description, new ErrorType().message);
      }),
    );

    it.effect.each([
      {
        name: "AiGatewayDisabled",
        ErrorType: AiGatewayDecisionClient.AiGatewayDisabled,
      },
      {
        name: "AiGatewayUnavailable",
        ErrorType: AiGatewayDecisionClient.AiGatewayUnavailable,
      },
    ])("preserves $name before HTTP", ({ ErrorType }) =>
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
  });

  it("shares the existing gateway error types", () => {
    assert.strictEqual(
      AiGatewayDecisionClient.AiGatewayDisabled,
      AiGatewayLanguageClient.AiGatewayDisabled,
    );
    assert.strictEqual(
      AiGatewayDecisionClient.AiGatewayUnavailable,
      AiGatewayLanguageClient.AiGatewayUnavailable,
    );
  });
});
