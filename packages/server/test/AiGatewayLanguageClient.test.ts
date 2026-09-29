import { AiGatewayLanguageClient } from "@confect/server";
import * as LanguageClient from "@confect/server/AiGatewayLanguageClient";
import { assert, describe, it } from "@effect/vitest";
import type * as ConvexServer from "convex/server";
import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
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

describe("AiGatewayLanguageClient", () => {
  it("exports the language client from the barrel and subpath", () => {
    assert.strictEqual(AiGatewayLanguageClient, LanguageClient);
    assert.strictEqual(
      AiGatewayLanguageClient.AiGatewayLanguageClient,
      OpenAiClient.OpenAiClient,
    );
  });

  describe.each([
    ["make", AiGatewayLanguageClient.make],
    [
      "layer",
      Effect.service(AiGatewayLanguageClient.AiGatewayLanguageClient).pipe(
        Effect.provide(AiGatewayLanguageClient.layer),
      ),
    ],
  ] as const)("%s", (_name, make) => {
    it.effect("authenticates language requests with the action token", () =>
      Effect.gen(function* () {
        getServiceToken.mockReset().mockResolvedValue("test-token");
        const client = yield* make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                assert.strictEqual(
                  request.url,
                  "https://ai-gateway.convex.dev/v1/chat/completions",
                );
                assert.strictEqual(
                  request.headers.authorization,
                  "Bearer test-token",
                );
                return HttpClientResponse.fromWeb(request, Response.json({}));
              }),
            ),
          ),
        );

        yield* client.client.post("/chat/completions");
        assert.deepStrictEqual(getServiceToken.mock.calls, [["ai-gateway"]]);
      }),
    );

    it.effect.each([
      {
        name: "AiGatewayDisabled",
        ErrorType: AiGatewayLanguageClient.AiGatewayDisabled,
      },
      {
        name: "AiGatewayUnavailable",
        ErrorType: AiGatewayLanguageClient.AiGatewayUnavailable,
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
        assert.strictEqual(error.constructor, ErrorType);
      }),
    );
  });
});
