import { getServiceToken as getConvexServiceToken } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

/**
 * Tagged error indicating that the team's plan or settings disable the Convex
 * AI gateway. Check that the team has a paid plan, or contact Convex support if
 * access should be enabled.
 *
 * @category Errors
 */
export class AiGatewayDisabled extends Schema.TaggedError<
  AiGatewayDisabled,
  unknown
>()("AiGatewayDisabled", {}) {
  /**
   * Returns guidance for restoring the team's gateway access.
   *
   * @category Getters
   */
  override get message(): string {
    return "The Convex AI gateway is disabled. Your team may be on the free plan, or the gateway may have been disabled for your team. Upgrade to a paid plan, or email support@convex.dev if this looks wrong.";
  }
}

/**
 * Tagged error indicating that the deployment cannot use the Convex AI gateway.
 * For local development, log in, link the deployment to a project, and update
 * the CLI and backend. Anonymous and self-hosted deployments cannot use the
 * gateway.
 *
 * @category Errors
 */
export class AiGatewayUnavailable extends Schema.TaggedError<
  AiGatewayUnavailable,
  unknown
>()("AiGatewayUnavailable", {}) {
  /**
   * Returns the local deployment requirements and an alternative for
   * unsupported deployments.
   *
   * @category Getters
   */
  override get message(): string {
    return "The Convex AI gateway is unavailable on this deployment. For local development, log in, link the deployment to a Convex project, and update the Convex CLI and local backend. Anonymous and self-hosted deployments cannot use the gateway; call the model provider directly with your own API key instead.";
  }
}

/**
 * Schema for the two gateway availability errors: {@link AiGatewayDisabled} and
 * {@link AiGatewayUnavailable}.
 *
 * @category Schemas
 */
export const AiGatewayError = Schema.Union([
  AiGatewayDisabled,
  AiGatewayUnavailable,
]);

/**
 * Union of the tagged errors that a gateway client layer can return when
 * checking access. Unexpected token-service rejections are defects, not members
 * of this union.
 *
 * @category Errors
 */
export type AiGatewayError = typeof AiGatewayError.Type;

type GetServiceToken = typeof getConvexServiceToken;
type AiGatewayErrorCode = AiGatewayError["_tag"];

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

/**
 * @internal
 */
export interface Service {
  readonly get: (
    service: "ai-gateway",
  ) => Effect.Effect<string, AiGatewayError>;
}

/**
 * @internal
 */
export class AiGatewayServiceToken extends Context.Service<
  AiGatewayServiceToken,
  Service
>()("@confect/server/internal/AiGatewayServiceToken") {}

const matchesErrorCode = (
  rejection: unknown,
  code: AiGatewayErrorCode,
): boolean =>
  (typeof rejection === "object" &&
    rejection !== null &&
    "code" in rejection &&
    rejection.code === code) ||
  (rejection instanceof Error &&
    (String.includes(nodeRuntimeErrorCodeFragments[code])(rejection.message) ||
      String.includes(defaultRuntimeErrorMessagePrefixes[code])(
        rejection.message,
      )));

const classifyError = (rejection: unknown): AiGatewayError => {
  if (matchesErrorCode(rejection, "AiGatewayDisabled")) {
    return AiGatewayDisabled.make();
  }
  if (matchesErrorCode(rejection, "AiGatewayUnavailable")) {
    return AiGatewayUnavailable.make();
  }
  throw rejection;
};

/**
 * @internal
 */
export const make = (getServiceToken: GetServiceToken): Service => ({
  get: (service) =>
    Effect.tryPromise({
      try: () => getServiceToken(service),
      catch: classifyError,
    }),
});

/**
 * @internal
 */
export const service = make(getConvexServiceToken);

/**
 * @internal
 */
export const layer = Layer.succeed(AiGatewayServiceToken, service);

/**
 * @internal
 */
export const transformClientRequest = (serviceToken: Service) =>
  HttpClient.mapRequestEffect((request) =>
    serviceToken.get("ai-gateway").pipe(
      Effect.mapBoth({
        onSuccess: (token) => HttpClientRequest.bearerToken(request, token),
        onFailure: (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause,
              description: cause.message,
            }),
          }),
      }),
    ),
  );
