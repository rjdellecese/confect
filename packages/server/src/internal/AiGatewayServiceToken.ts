import { getServiceToken as getConvexServiceToken } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

/**
 * The current team is on the free plan or has the Convex AI gateway disabled.
 * Upgrade to a paid plan, or contact Convex support if this looks wrong.
 */
export class AiGatewayDisabled extends Schema.TaggedError<AiGatewayDisabled>()(
  "AiGatewayDisabled",
  {},
) {
  override get message(): string {
    return "The Convex AI gateway is disabled. Your team may be on the free plan, or the gateway may have been disabled for your team. Upgrade to a paid plan, or email support@convex.dev if this looks wrong.";
  }
}

/**
 * The current deployment is local or self-hosted and cannot use the Convex AI
 * gateway. Call the model provider directly with your own API key instead.
 */
export class AiGatewayUnavailable extends Schema.TaggedError<AiGatewayUnavailable>()(
  "AiGatewayUnavailable",
  {},
) {
  override get message(): string {
    return "The Convex AI gateway is unavailable. This action is running on a local or self-hosted deployment, which cannot use the gateway. Call the model provider directly with your own API key stored in a Convex environment variable.";
  }
}

/**
 * A schema for the possible failures that can occur while obtaining a Convex AI
 * gateway service token.
 */
export const AiGatewayError = Schema.Union([
  AiGatewayDisabled,
  AiGatewayUnavailable,
]);

/**
 * The possible failures that can occur while obtaining a Convex AI gateway
 * service token.
 */
export type AiGatewayError = typeof AiGatewayError.Type;

type GetServiceToken = typeof getConvexServiceToken;

type AiGatewayErrorCode = "AiGatewayDisabled" | "AiGatewayUnavailable";

const nodeRuntimeErrorCodeFragments: Record<AiGatewayErrorCode, string> = {
  AiGatewayDisabled: '"code":"AiGatewayDisabled"',
  AiGatewayUnavailable: '"code":"AiGatewayUnavailable"',
};

// The default Convex runtime exposes only the human-readable ErrorMetadata
// message. Node actions preserve the short code in a wrapped JSON response.
const defaultRuntimeErrorMessagePrefixes: Record<AiGatewayErrorCode, string> = {
  AiGatewayDisabled: "The Convex AI gateway is not enabled for your team.",
  AiGatewayUnavailable:
    '`getServiceToken("ai-gateway")` isn\'t available on this deployment',
};

export interface Service {
  readonly get: (
    service: "ai-gateway",
  ) => Effect.Effect<string, AiGatewayError>;
}

const matchesErrorCode = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The rejection classifier inspects arbitrary SDK failures and preserves those it cannot recognize.
  rejection: unknown,
  code: AiGatewayErrorCode,
): boolean =>
  (Predicate.isObjectOrArray(rejection) &&
    Predicate.hasProperty(rejection, "code") &&
    rejection.code === code) ||
  (rejection instanceof Error &&
    (rejection.message.includes(nodeRuntimeErrorCodeFragments[code]) ||
      rejection.message.includes(defaultRuntimeErrorMessagePrefixes[code])));

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- The SDK may reject with any value; recognized codes become typed errors and the fallback retains the original cause.
const classifyError = (rejection: unknown): AiGatewayError => {
  if (matchesErrorCode(rejection, "AiGatewayDisabled")) {
    return new AiGatewayDisabled();
  }

  if (matchesErrorCode(rejection, "AiGatewayUnavailable")) {
    return new AiGatewayUnavailable();
  }

  throw rejection;
};

export const make = (getServiceToken: GetServiceToken): Service => ({
  get: (service) =>
    Effect.tryPromise({
      try: () => getServiceToken(service),
      catch: classifyError,
    }),
});

export class AiGatewayServiceToken extends Context.Service<
  AiGatewayServiceToken,
  Service
>()("@confect/server/internal/AiGatewayServiceToken") {
  static readonly layer = Layer.succeed(this, make(getConvexServiceToken));
}
