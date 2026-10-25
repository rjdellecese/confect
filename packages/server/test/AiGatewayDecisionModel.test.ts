import { AiGatewayDecisionModel } from "@confect/server";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Decision from "effect/ai/Decision";
import * as DecisionModel from "effect/ai/DecisionModel";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as InternalAiGatewayDecisionClient from "../src/internal/AiGatewayDecisionClient";
import { AiGatewayServiceToken } from "../src/internal/AiGatewayServiceToken";

const modelId = "typesafe/jev-1.13";

const TicketTriage = Decision.make({
  input: Schema.Struct({ message: Schema.String }),
  decisions: {
    priority: Decision.classify({
      instructions: "Choose the ticket priority",
      criteria: { urgent: "An outage", normal: "Has a workaround" },
    }),
    severity: Decision.rate({
      instructions: "Rate the impact",
      criteria: ["low", "medium", "high"],
    }),
    escalate: Decision.probability({
      instructions: "Needs human attention",
      criteria: { false: "Self-service", true: "Needs a human" },
    }),
  },
});

const responseBody = {
  id: "decision-test",
  model: modelId,
  answers: {
    priority: {
      type: "choice",
      choice: "urgent",
      probabilities: { urgent: 0.9, normal: 0.1 },
      confidence: 0.8,
    },
    severity: {
      type: "score",
      score: 1.7,
      probabilities: { "0": 0.1, "1": 0.1, "2": 0.8 },
      confidence: 0.7,
    },
    escalate: { type: "noul", noul: 0.95 },
  },
  usage: { input_tokens: 21, output_tokens: 3, cost: 0.0042 },
};

const clientLayer = (
  respond: (
    request: HttpClientRequest.HttpClientRequest,
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse>,
) =>
  InternalAiGatewayDecisionClient.layer.pipe(
    Layer.provide(
      Layer.succeed(AiGatewayServiceToken, {
        get: () => Effect.succeed("decision-token"),
      }),
    ),
    Layer.provide(
      Layer.succeed(HttpClient.HttpClient, HttpClient.make(respond)),
    ),
  );

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown,
  status = 200,
) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

describe("AiGatewayDecisionModel", () => {
  it.effect.each([
    ["model", AiGatewayDecisionModel.model(modelId)],
    ["layer", AiGatewayDecisionModel.layer({ model: modelId })],
    [
      "make",
      Layer.effect(
        DecisionModel.DecisionModel,
        AiGatewayDecisionModel.make({ model: modelId }),
      ),
    ],
  ] as const)(
    "%s sends all decision kinds in one authenticated request",
    ([, modelLayer]) =>
      Effect.gen(function* () {
        let requests = 0;
        const result = yield* DecisionModel.decide(TicketTriage, {
          input: { message: "Nobody can sign in" },
        }).pipe(
          Effect.provide(
            modelLayer.pipe(
              Layer.provide(
                clientLayer((request) =>
                  Effect.gen(function* () {
                    requests++;
                    assert.strictEqual(request.method, "POST");
                    assert.strictEqual(
                      request.url,
                      "https://ai-gateway.convex.dev/alpha/decisions",
                    );
                    assert.strictEqual(
                      request.headers.authorization,
                      "Bearer decision-token",
                    );
                    assert.strictEqual(request.body._tag, "Uint8Array");
                    if (request.body._tag === "Uint8Array") {
                      assert.deepStrictEqual(
                        yield* Schema.decodeEffect(
                          Schema.fromJsonString(Schema.Unknown),
                        )(new TextDecoder().decode(request.body.body)).pipe(
                          Effect.orDie,
                        ),
                        {
                          model: modelId,
                          state: { message: "Nobody can sign in" },
                          questions: {
                            priority: {
                              type: "choice",
                              instructions: "Choose the ticket priority",
                              criteria: {
                                urgent: "An outage",
                                normal: "Has a workaround",
                              },
                            },
                            severity: {
                              type: "score",
                              instructions: "Rate the impact",
                              criteria: ["low", "medium", "high"],
                            },
                            escalate: {
                              type: "noul",
                              instructions: "Needs human attention",
                              criteria: {
                                false: "Self-service",
                                true: "Needs a human",
                              },
                            },
                          },
                        },
                      );
                    }
                    return jsonResponse(request, responseBody);
                  }),
                ),
              ),
            ),
          ),
        );

        assert.strictEqual(requests, 1);
        assert.strictEqual(result.answers.priority.label, "urgent");
        assert.deepStrictEqual(result.answers.priority.probabilities, {
          urgent: 0.9,
          normal: 0.1,
        });
        assert.strictEqual(result.answers.priority.confidence, 0.8);
        assert.strictEqual(result.answers.severity.rating, 1.7);
        assert.strictEqual(result.answers.severity.label, "high");
        assert.deepStrictEqual(result.answers.severity.probabilities, {
          low: 0.1,
          medium: 0.1,
          high: 0.8,
        });
        assert.strictEqual(result.answers.escalate.probability, 0.95);
        assert.strictEqual(result.usage.inputTokens, 21);
        assert.strictEqual(result.usage.outputTokens, 3);
      }),
  );

  it.effect("normalizes captured Jev choice and score distributions", () =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          neutral3: Decision.classify({
            instructions: "Choose a preliminary investigation group",
            criteria: {
              group_a: "A general investigation group",
              group_b: "A general investigation group",
              group_c: "A general investigation group",
            },
          }),
          urgency5: Decision.rate({
            instructions: "How urgently should the team respond?",
            criteria: [
              "No time pressure",
              "Low priority",
              "Normal response time",
              "Needs attention soon",
              "Immediate response required",
            ],
          }),
        },
      });
      const body = {
        ...responseBody,
        answers: {
          neutral3: {
            type: "choice",
            choice: "group_a",
            probabilities: { group_a: 0.93, group_b: 0.04, group_c: 0.02 },
            confidence: 0.9,
          },
          urgency5: {
            type: "score",
            score: 0.77,
            probabilities: { "0": 0.28, "1": 0.66, "2": 0.05, "3": 0, "4": 0 },
            confidence: 0.72,
          },
        },
      };
      const result = yield* DecisionModel.decide(definition, {
        input: "Help",
      }).pipe(
        Effect.provide(
          AiGatewayDecisionModel.model(modelId).pipe(
            Layer.provide(
              clientLayer((request) =>
                Effect.succeed(jsonResponse(request, body)),
              ),
            ),
          ),
        ),
      );
      assert.strictEqual(result.answers.neutral3.label, "group_a");
      assert.strictEqual(result.answers.urgency5.label, "Low priority");
      assert.strictEqual(result.answers.urgency5.rating, 0.77);
      for (const [probabilities, expected] of [
        [
          result.answers.neutral3.probabilities,
          { group_a: 0.93, group_b: 0.04, group_c: 0.02 },
        ],
        [
          result.answers.urgency5.probabilities,
          {
            "No time pressure": 0.28,
            "Low priority": 0.66,
            "Normal response time": 0.05,
            "Needs attention soon": 0,
            "Immediate response required": 0,
          },
        ],
      ] as const) {
        for (const [label, probability] of Object.entries(probabilities)) {
          const expectedProbability = Object.entries(expected).find(
            ([key]) => key === label,
          )?.[1];
          assert(typeof expectedProbability === "number");
          assert(Math.abs(probability - expectedProbability / 0.99) < 1e-10);
        }
        assert(
          Math.abs(
            Object.values(probabilities).reduce(
              (total, value) => total + value,
              0,
            ) - 1,
          ) < 1e-10,
        );
      }
    }),
  );

  describe.each([
    ["zero totals", [0, 0, 0]],
    ["excessively low totals", [0.1, 0.1, 0.1]],
    ["excessively high totals", [0.8, 0.8, 0.8]],
    ["out-of-range values", [1.1, -0.1, 0]],
  ] as const)("rejects %s", (_name, probabilities) => {
    it.effect.each([
      [
        "priority",
        {
          ...responseBody.answers.priority,
          probabilities: { urgent: probabilities[0], normal: probabilities[1] },
        },
      ],
      [
        "severity",
        {
          ...responseBody.answers.severity,
          probabilities: {
            "0": probabilities[0],
            "1": probabilities[1],
            "2": probabilities[2],
          },
        },
      ],
    ] as const)("for %s despite rounding tolerance", ([decision, answer]) =>
      Effect.gen(function* () {
        const error = yield* DecisionModel.decide(TicketTriage, {
          input: { message: "Help" },
        }).pipe(
          Effect.provide(
            AiGatewayDecisionModel.model(modelId).pipe(
              Layer.provide(
                clientLayer((request) =>
                  Effect.succeed(
                    jsonResponse(request, {
                      ...responseBody,
                      answers: {
                        ...responseBody.answers,
                        [decision]: answer,
                      },
                    }),
                  ),
                ),
              ),
            ),
          ),
          Effect.flip,
        );
        assert(error._tag === "AiError");
        assert.strictEqual(error.reason._tag, "InvalidOutputError");
      }),
    );
  });

  it.effect.each([
    ["missing answers", { ...responseBody, answers: {} }],
    [
      "missing distributions",
      {
        ...responseBody,
        answers: {
          ...responseBody.answers,
          priority: { type: "choice", choice: "urgent" },
        },
      },
    ],
    [
      "invalid distributions",
      {
        ...responseBody,
        answers: {
          ...responseBody.answers,
          priority: {
            ...responseBody.answers.priority,
            probabilities: { urgent: 0.9, normal: 0.9 },
          },
        },
      },
    ],
    [
      "invalid probabilities",
      {
        ...responseBody,
        answers: {
          ...responseBody.answers,
          escalate: { type: "noul", noul: 2 },
        },
      },
    ],
  ] as const)("rejects %s through AiError", ([, body]) =>
    Effect.gen(function* () {
      const error = yield* DecisionModel.decide(TicketTriage, {
        input: { message: "Help" },
      }).pipe(
        Effect.provide(
          AiGatewayDecisionModel.model(modelId).pipe(
            Layer.provide(
              clientLayer((request) =>
                Effect.succeed(jsonResponse(request, body)),
              ),
            ),
          ),
        ),
        Effect.flip,
      );
      assert(error._tag === "AiError");
      assert.strictEqual(error.reason._tag, "InvalidOutputError");
    }),
  );

  it.effect("rejects scalar state without sending a request", () =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.Finite,
        decisions: {
          escalate: Decision.probability({
            instructions: "Needs attention",
            criteria: { false: "No", true: "Yes" },
          }),
        },
      });
      const error = yield* DecisionModel.decide(definition, { input: 42 }).pipe(
        Effect.provide(
          AiGatewayDecisionModel.model(modelId).pipe(
            Layer.provide(
              clientLayer(() => Effect.die("Unexpected HTTP request")),
            ),
          ),
        ),
        Effect.flip,
      );
      assert(error._tag === "AiError");
      assert.strictEqual(error.reason._tag, "InvalidUserInputError");
    }),
  );

  it.effect("preserves HTTP failures in the AiError channel", () =>
    Effect.gen(function* () {
      const error = yield* DecisionModel.decide(TicketTriage, {
        input: { message: "Help" },
      }).pipe(
        Effect.provide(
          AiGatewayDecisionModel.model(modelId).pipe(
            Layer.provide(
              clientLayer((request) =>
                Effect.succeed(
                  jsonResponse(
                    request,
                    {
                      error: {
                        message: "Temporarily unavailable",
                        type: "upstream_error",
                        code: "upstream_error",
                      },
                    },
                    503,
                  ),
                ),
              ),
            ),
          ),
        ),
        Effect.flip,
      );
      assert(error._tag === "AiError");
      assert.strictEqual(error.reason._tag, "InternalProviderError");
    }),
  );
});
