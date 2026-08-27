import * as Schema from "effect/Schema";

/**
 * The current team is on the free plan or has the Convex AI gateway disabled.
 * Upgrade to a paid plan, or contact Convex support if this looks wrong.
 */
export class AiGatewayDisabled extends Schema.TaggedError<AiGatewayDisabled>()(
  "AiGatewayDisabled",
  {
    cause: Schema.Unknown,
  },
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
  {
    cause: Schema.Unknown,
  },
) {
  override get message(): string {
    return "The Convex AI gateway is unavailable. This action is running on a local or self-hosted deployment, which cannot use the gateway. Call the model provider directly with your own API key stored in a Convex environment variable.";
  }
}

/**
 * An expected failure while connecting to the Convex AI gateway.
 */
export type AiGatewayError = AiGatewayDisabled | AiGatewayUnavailable;
