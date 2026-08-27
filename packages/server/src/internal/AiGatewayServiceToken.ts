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

const errorCodePatterns: Record<AiGatewayErrorCode, RegExp> = {
  AiGatewayDisabled: /(?:^|[^A-Za-z0-9_])AiGatewayDisabled(?:$|[^A-Za-z0-9_])/u,
  AiGatewayUnavailable:
    /(?:^|[^A-Za-z0-9_])AiGatewayUnavailable(?:$|[^A-Za-z0-9_])/u,
};

export interface Service {
  readonly get: (
    service: "ai-gateway",
  ) => Effect.Effect<string, AiGatewayError>;
}

const hasErrorCode = (cause: unknown, code: AiGatewayErrorCode): boolean =>
  (typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === code) ||
  (cause instanceof Error && errorCodePatterns[code].test(cause.message));

const classifyError = (cause: unknown): AiGatewayError => {
  if (hasErrorCode(cause, "AiGatewayDisabled")) {
    return new AiGatewayDisabled({ cause });
  }
  if (hasErrorCode(cause, "AiGatewayUnavailable")) {
    return new AiGatewayUnavailable({ cause });
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
