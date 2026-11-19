import type { PlatformCreateDeployKeyArgs } from "@convex-dev/platform/managementApi";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";

import { ConvexClient } from "./ConvexClient.js";
import type { Providers } from "./Providers.js";
import { resourceName } from "./internal/ResourceIdentity.js";
import { checkpointResource } from "./internal/Lifecycle.js";

export interface DeployKeyProps {
  readonly deploymentName: string;
  readonly name?: string;
  readonly allowedActions?: ReadonlyArray<
    NonNullable<PlatformCreateDeployKeyArgs["allowedActions"]>[number]
  >;
}

export interface DeployKeyAttributes {
  readonly deploymentName: string;
  readonly keyId: number;
  readonly name: string;
  readonly deployKey: Redacted.Redacted<string>;
  readonly allowedActions: ReadonlyArray<string>;
}

export type DeployKey = Resource<
  "Convex.DeployKey",
  DeployKeyProps,
  DeployKeyAttributes,
  never,
  Providers
>;
export const DeployKey = Resource<DeployKey>("Convex.DeployKey");

export class DeployKeyRecoveryRequired extends Schema.TaggedError<
  DeployKeyRecoveryRequired,
  { readonly brand: unique symbol }
>()("DeployKeyRecoveryRequired", {
  deploymentName: Schema.String,
  keyName: Schema.String,
  keyIds: Schema.Array(Schema.Finite),
}) {}

export class DeployKeyChangeRequiresNewResource extends Schema.TaggedError<
  DeployKeyChangeRequiresNewResource,
  { readonly brand: unique symbol }
>()("DeployKeyChangeRequiresNewResource", {
  deploymentName: Schema.String,
  keyId: Schema.Finite,
  field: Schema.String,
}) {}

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const readKeys = (deploymentName: string) =>
    client
      .listDeployKeys(deploymentName)
      .pipe(Effect.catchTag("ConvexNotFound", () => Effect.succeed([])));
  const hasName = (keyName: string, name: string) =>
    keyName === name ||
    (Str.startsWith(`${name} (`)(keyName) &&
      /^[0-9a-f]{8}\)$/.test(Str.slice(name.length + 2)(keyName)));
  const recover = (
    deploymentName: string,
    name: string,
    keyIds: ReadonlyArray<number>,
  ) =>
    DeployKeyRecoveryRequired.make({ deploymentName, keyName: name, keyIds });
  return {
    diff: Effect.fn("DeployKey.diff")(function* ({ news, output }) {
      if (!isResolved(news) || output === undefined) return;
      for (const field of ["deploymentName", "name"] as const) {
        if (news[field] !== undefined && news[field] !== output[field])
          return yield* DeployKeyChangeRequiresNewResource.make({
            deploymentName: output.deploymentName,
            keyId: output.keyId,
            field,
          });
      }
      const keys = yield* readKeys(output.deploymentName);
      const key = Option.getOrUndefined(
        Arr.findFirst(keys, (candidate) => candidate.id === output.keyId),
      );
      if (key === undefined || !Redacted.isRedacted(output.deployKey))
        return yield* recover(output.deploymentName, output.name, [
          output.keyId,
        ]);
      if (!hasName(key.name, news.name ?? output.name))
        return yield* DeployKeyChangeRequiresNewResource.make({
          deploymentName: output.deploymentName,
          keyId: output.keyId,
          field: "name",
        });
      const allowedActions = news.allowedActions ?? output.allowedActions;
      if (
        new Set(allowedActions).size !== new Set(key.allowedActions).size ||
        Arr.some(
          allowedActions,
          (action) => !Arr.contains(key.allowedActions, action),
        )
      )
        return yield* DeployKeyChangeRequiresNewResource.make({
          deploymentName: output.deploymentName,
          keyId: output.keyId,
          field: "allowedActions",
        });
    }),
    read: Effect.fn("DeployKey.read")(function* ({ instanceId, olds, output }) {
      const deploymentName = output?.deploymentName ?? olds.deploymentName;
      if (deploymentName === undefined) return;
      const name = output?.name ?? olds.name ?? resourceName("key", instanceId);
      const keys = yield* readKeys(deploymentName);
      if (output !== undefined) {
        const key = Option.getOrUndefined(
          Arr.findFirst(keys, (candidate) => candidate.id === output.keyId),
        );
        if (key === undefined)
          return yield* recover(deploymentName, name, [output.keyId]);
        if (!Redacted.isRedacted(output.deployKey))
          return yield* recover(deploymentName, name, [key.id]);
        return {
          ...output,
          allowedActions: key.allowedActions,
        };
      }
      const matches = Arr.filter(keys, (key) => hasName(key.name, name));
      if (matches.length > 0)
        return yield* recover(
          deploymentName,
          name,
          Arr.map(matches, (candidate) => candidate.id),
        );
      return undefined;
    }),
    reconcile: Effect.fn("DeployKey.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      output,
    }) {
      if (output === undefined)
        yield* checkpointResource(fqn, instanceId, news);
      const name = news.name ?? output?.name ?? resourceName("key", instanceId);
      if (output !== undefined) {
        for (const field of ["deploymentName", "name"] as const) {
          if (news[field] !== undefined && news[field] !== output[field])
            return yield* DeployKeyChangeRequiresNewResource.make({
              deploymentName: output.deploymentName,
              keyId: output.keyId,
              field,
            });
        }
        const keys = yield* readKeys(output.deploymentName);
        const key = Option.getOrUndefined(
          Arr.findFirst(keys, (candidate) => candidate.id === output.keyId),
        );
        if (key === undefined || !Redacted.isRedacted(output.deployKey))
          return yield* recover(output.deploymentName, name, [output.keyId]);
        if (!hasName(key.name, name))
          return yield* DeployKeyChangeRequiresNewResource.make({
            deploymentName: output.deploymentName,
            keyId: output.keyId,
            field: "name",
          });
        const allowedActions = news.allowedActions ?? output.allowedActions;
        if (
          new Set(allowedActions).size !== new Set(key.allowedActions).size ||
          Arr.some(
            allowedActions,
            (action) => !Arr.contains(key.allowedActions, action),
          )
        )
          return yield* DeployKeyChangeRequiresNewResource.make({
            deploymentName: output.deploymentName,
            keyId: output.keyId,
            field: "allowedActions",
          });
        return {
          ...output,
          allowedActions: key.allowedActions,
        };
      }
      const keys = yield* client.listDeployKeys(news.deploymentName);
      const existing = Arr.filter(keys, (key) => hasName(key.name, name));
      if (existing.length > 0)
        return yield* recover(
          news.deploymentName,
          name,
          Arr.map(existing, (key) => key.id),
        );
      return yield* Effect.acquireUseRelease(
        client.createDeployKey(news.deploymentName, {
          name,
          ...(news.allowedActions === undefined
            ? {}
            : { allowedActions: [...news.allowedActions] }),
        }),
        ({ deployKey }) =>
          Effect.gen(function* () {
            const createdKeys = yield* client.listDeployKeys(
              news.deploymentName,
            );
            const matches = Arr.filter(createdKeys, (key) =>
              hasName(key.name, name),
            );
            const key = matches[0];
            if (matches.length !== 1 || key === undefined)
              return yield* recover(
                news.deploymentName,
                name,
                Arr.map(matches, (candidate) => candidate.id),
              );
            return {
              deploymentName: news.deploymentName,
              keyId: key.id,
              name,
              deployKey,
              allowedActions: key.allowedActions,
            };
          }),
        ({ deployKey }, exit) =>
          Exit.isFailure(exit)
            ? client
                .deleteDeployKey(news.deploymentName, deployKey)
                .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void))
            : Effect.void,
      );
    }),
    delete: Effect.fn("DeployKey.delete")(function* ({ output }) {
      if (!Redacted.isRedacted(output.deployKey)) {
        const keys = yield* readKeys(output.deploymentName);
        if (Arr.some(keys, (key) => key.id === output.keyId))
          return yield* recover(output.deploymentName, output.name, [
            output.keyId,
          ]);
        return;
      }
      yield* client
        .deleteDeployKey(output.deploymentName, output.deployKey)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<DeployKey>;
});

export const layer = Provider.effect(DeployKey, provider);
