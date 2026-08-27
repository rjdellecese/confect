import { getServiceToken } from "convex/server";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class AiGatewayServiceTokenError extends Data.TaggedError(
  "AiGatewayServiceTokenError",
)<{
  readonly cause: unknown;
}> {}

export interface Service {
  readonly get: (
    service: "ai-gateway",
  ) => Effect.Effect<string, AiGatewayServiceTokenError>;
}

export class AiGatewayServiceToken extends Context.Service<
  AiGatewayServiceToken,
  Service
>()("@confect/server/internal/AiGatewayServiceToken") {
  static readonly layer = Layer.succeed(this, {
    get: (service) =>
      Effect.tryPromise({
        try: () => getServiceToken(service),
        catch: (cause) => new AiGatewayServiceTokenError({ cause }),
      }),
  });
}
