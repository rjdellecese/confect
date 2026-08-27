import * as Schema from "effect/Schema";

/**
 * The Convex AI gateway is not enabled for the current team.
 */
export class AiGatewayDisabled extends Schema.TaggedError<AiGatewayDisabled>()(
  "AiGatewayDisabled",
  {
    cause: Schema.Unknown,
  },
) {
  override get message(): string {
    return "The Convex AI gateway is not enabled for your team";
  }
}

/**
 * The Convex AI gateway is not available on the current deployment.
 */
export class AiGatewayUnavailable extends Schema.TaggedError<AiGatewayUnavailable>()(
  "AiGatewayUnavailable",
  {
    cause: Schema.Unknown,
  },
) {
  override get message(): string {
    return "The Convex AI gateway is unavailable on this deployment";
  }
}

/**
 * An expected failure while connecting to the Convex AI gateway.
 */
export type AiGatewayError = AiGatewayDisabled | AiGatewayUnavailable;
