import { getServiceToken as getConvexServiceToken } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AiGatewayDisabled,
  type AiGatewayError,
  AiGatewayUnavailable,
} from "../AiGatewayError";

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

const matchesErrorCode = (cause: unknown, code: AiGatewayErrorCode): boolean =>
  (typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === code) ||
  (cause instanceof Error &&
    (cause.message.includes(nodeRuntimeErrorCodeFragments[code]) ||
      cause.message.includes(defaultRuntimeErrorMessagePrefixes[code])));

const classifyError = (cause: unknown): AiGatewayError => {
  if (matchesErrorCode(cause, "AiGatewayDisabled")) {
    return new AiGatewayDisabled();
  }
  if (matchesErrorCode(cause, "AiGatewayUnavailable")) {
    return new AiGatewayUnavailable();
  }
  throw cause;
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
