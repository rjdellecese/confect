import * as Layer from "effect/Layer";
import { AiGatewayLanguageClient } from "@confect/server";
import * as LanguageClient from "@confect/server/AiGatewayLanguageClient";
import { assert, beforeEach, describe, it } from "@effect/vitest";
import type * as ConvexServer from "convex/server";
import * as OpenAiClient from "@effect/ai-openai-compat/OpenAiClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Stream from "effect/Stream";
import { vi } from "vitest";

const { getServiceToken, getServiceUrl } = vi.hoisted(() => ({
  getServiceToken: vi.fn(),
  getServiceUrl: vi.fn(),
}));

vi.mock("convex/server", (importOriginal) =>
  importOriginal<typeof ConvexServer>().then((original) => ({
    ...original,
    getServiceToken,
    getServiceUrl,
  })),
);

describe("AiGatewayLanguageClient", () => {
  beforeEach(() => {
    getServiceUrl
      .mockReset()
      .mockResolvedValue("https://ai-gateway.convex.dev");
  });
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
      Effect.gen(function* () {
        const services = yield* Layer.build(AiGatewayLanguageClient.layer);
        return yield* Effect.service(
          AiGatewayLanguageClient.AiGatewayLanguageClient,
        ).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped),
    ],
  ] as const)("%s", (_name, make) => {
    it.effect("discovers each client's origin only when constructed", () =>
      Effect.gen(function* () {
        getServiceToken.mockReset().mockResolvedValue("test-token");
        getServiceUrl
          .mockResolvedValueOnce("https://first.gateway.test")
          .mockResolvedValueOnce("https://second.gateway.test");
        const urls: Array<string> = [];
        const construct = make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                urls.push(request.url);
                assert.strictEqual(
                  request.headers.authorization,
                  "Bearer test-token",
                );
                return HttpClientResponse.fromWeb(
                  request,
                  new Response("data: [DONE]\n\n"),
                );
              }),
            ),
          ),
        );
        assert.strictEqual(getServiceUrl.mock.calls.length, 0);
        const first = yield* construct;
        yield* first.client.post("/chat/completions");
        yield* first
          .createResponseStream({ model: "openai/gpt-4o-mini", messages: [] })
          .pipe(Effect.flatMap(([, stream]) => Stream.runDrain(stream)));
        const second = yield* construct;
        yield* second.client.get("/models");
        assert.deepStrictEqual(urls, [
          "https://first.gateway.test/v1/chat/completions",
          "https://first.gateway.test/v1/chat/completions",
          "https://second.gateway.test/v1/models",
        ]);
        assert.deepStrictEqual(getServiceUrl.mock.calls, [
          ["ai-gateway"],
          ["ai-gateway"],
        ]);
        assert.strictEqual(getServiceToken.mock.calls.length, 5);
      }),
    );

    it.effect("preserves discovery failures without a fallback request", () =>
      Effect.gen(function* () {
        const failure = { reason: "Service discovery unavailable" };
        getServiceToken.mockReset().mockResolvedValue("test-token");
        getServiceUrl.mockRejectedValue(failure);
        const result = yield* make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("Unexpected HTTP request")),
          ),
          Effect.exit,
        );
        assert.deepStrictEqual(result, Exit.die(failure));
        assert.deepStrictEqual(getServiceUrl.mock.calls, [["ai-gateway"]]);
        assert.strictEqual(getServiceToken.mock.calls.length, 1);
      }),
    );

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
        assert.deepStrictEqual(getServiceToken.mock.calls, [
          ["ai-gateway"],
          ["ai-gateway"],
        ]);
      }),
    );

    it.effect.each(["http", "stream"] as const)(
      "uses refreshed credentials for each $0 request",
      (mode) =>
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
                    new Response("data: [DONE]\n\n", {
                      headers: { "content-type": "text/event-stream" },
                    }),
                  );
                }),
              ),
            ),
          );
          const request =
            mode === "http"
              ? client.client.post("/chat/completions")
              : client
                  .createResponseStream({
                    model: "openai/gpt-4o-mini",
                    messages: [],
                  })
                  .pipe(
                    Effect.flatMap(([, stream]) => Stream.runDrain(stream)),
                  );

          yield* request;
          yield* request;

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
        ErrorType: AiGatewayLanguageClient.AiGatewayDisabled,
      },
      {
        name: "AiGatewayUnavailable",
        ErrorType: AiGatewayLanguageClient.AiGatewayUnavailable,
      },
    ])("reports request-time $name as an AI error", ({ ErrorType }) =>
      Effect.gen(function* () {
        getServiceToken
          .mockReset()
          .mockResolvedValueOnce("construction-token")
          .mockRejectedValueOnce({ code: ErrorType.make()._tag });
        const client = yield* make.pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("Unexpected HTTP request")),
          ),
        );
        const error = yield* client
          .createResponse({ model: "openai/gpt-4o-mini", messages: [] })
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "AiError");
        assert.strictEqual(error.reason._tag, "NetworkError");
        if (error.reason._tag !== "NetworkError") {
          return;
        }
        assert.strictEqual(error.reason.description, ErrorType.make().message);
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
          .mockRejectedValue({ code: ErrorType.make()._tag });
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
