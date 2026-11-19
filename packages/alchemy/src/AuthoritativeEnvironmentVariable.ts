import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ConvexClient, type ConvexClientError } from "./ConvexClient";
import type { Providers } from "./Providers";
import { validateTarget } from "./internal/DeploymentTarget";
import { checkpointResource } from "./internal/Lifecycle";

export interface AuthoritativeEnvironmentVariableProps {
  readonly deployment: { readonly name: string; readonly url: string };
  readonly deployKey: Redacted.Redacted<string>;
  readonly name: string;
  readonly value: string | Redacted.Redacted<string>;
}

export interface AuthoritativeEnvironmentVariableAttributes {
  readonly name: string;
  readonly url: string;
}

export type AuthoritativeEnvironmentVariable = Resource<
  "Convex.AuthoritativeEnvironmentVariable",
  AuthoritativeEnvironmentVariableProps,
  AuthoritativeEnvironmentVariableAttributes,
  never,
  Providers
>;
export const AuthoritativeEnvironmentVariable =
  Resource<AuthoritativeEnvironmentVariable>(
    "Convex.AuthoritativeEnvironmentVariable",
    {
      defaultRemovalPolicy: "retain",
    },
  );

export class AuthoritativeEnvironmentVariableIdentityChange extends Schema.TaggedError<
  AuthoritativeEnvironmentVariableIdentityChange,
  { readonly brand: unique symbol }
>()("AuthoritativeEnvironmentVariableIdentityChange", {
  field: Schema.Literals(["name", "url"]),
}) {}

const validateIdentity = (
  { deployment, deployKey, name }: AuthoritativeEnvironmentVariableProps,
  output: AuthoritativeEnvironmentVariableAttributes | undefined,
) =>
  Result.gen(function* () {
    yield* validateTarget(deployment.name, deployment.url, deployKey);
    const target = { name, url: deployment.url };
    if (output === undefined) return target;
    for (const field of ["name", "url"] as const)
      if (target[field] !== output[field])
        return yield* Result.fail(
          AuthoritativeEnvironmentVariableIdentityChange.make({ field }),
        );
    return target;
  });

const isDefiniteRejection = (error: ConvexClientError) =>
  error.code === "InvalidRequest" ||
  (error.code === "HttpError" &&
    error.status !== undefined &&
    [400, 401, 403, 404, 405, 409, 413, 415, 422, 429].includes(error.status));

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  return {
    diff: Effect.fn("AuthoritativeEnvironmentVariable.diff")(function* ({
      news,
      output,
    }) {
      if (isResolved(news))
        yield* Effect.fromResult(validateIdentity(news, output));
      return { action: "update" };
    }),
    reconcile: Effect.fn("AuthoritativeEnvironmentVariable.reconcile")(
      function* ({ fqn, instanceId, news, output }) {
        const target = yield* Effect.fromResult(validateIdentity(news, output));
        if (output === undefined)
          yield* checkpointResource(fqn, instanceId, news, target);
        yield* client
          .updateEnvironmentVariables(target.url, news.deployKey, [
            { name: target.name, value: news.value },
          ])
          .pipe(
            Effect.tapError((error) =>
              output === undefined && isDefiniteRejection(error)
                ? checkpointResource(fqn, instanceId, news, null)
                : Effect.void,
            ),
          );
        return target;
      },
    ),
    delete: Effect.fn("AuthoritativeEnvironmentVariable.delete")(function* ({
      olds,
      output,
    }) {
      const target = yield* Effect.fromResult(validateIdentity(olds, output));
      yield* client
        .updateEnvironmentVariables(target.url, olds.deployKey, [
          { name: target.name },
        ])
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<AuthoritativeEnvironmentVariable>;
});

export const layer = Provider.effect(
  AuthoritativeEnvironmentVariable,
  provider,
);
