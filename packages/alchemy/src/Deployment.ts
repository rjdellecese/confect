import type {
  CreateDeploymentType,
  PlatformDeploymentResponse,
  RegionName,
} from "@convex-dev/platform/managementApi";
import { OwnedBySomeoneElse, Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ConvexClient } from "./ConvexClient";
import type { Providers } from "./Providers";
import { resourceName } from "./internal/ResourceIdentity";
import { checkpointCreate, shouldAdopt } from "./internal/Lifecycle";

export interface DeploymentProps {
  readonly projectId: number;
  readonly type: CreateDeploymentType;
  readonly reference?: string;
  readonly region?: RegionName;
}

export interface DeploymentAttributes {
  readonly projectId: number;
  readonly name: string;
  readonly reference: string;
  readonly type: CreateDeploymentType;
  readonly url: string;
  readonly region: RegionName;
}

export type Deployment = Resource<
  "Convex.Deployment",
  DeploymentProps,
  DeploymentAttributes,
  never,
  Providers
>;
export const Deployment = Resource<Deployment>("Convex.Deployment", {
  defaultRemovalPolicy: "retain",
});

export class DeploymentIdentityChange extends Schema.TaggedError<
  DeploymentIdentityChange,
  { readonly brand: unique symbol }
>()("DeploymentIdentityChange", {
  deploymentName: Schema.String,
  field: Schema.String,
  current: Schema.String,
  requested: Schema.String,
}) {}

export class UnsupportedLocalDeployment extends Schema.TaggedError<
  UnsupportedLocalDeployment,
  { readonly brand: unique symbol }
>()("UnsupportedLocalDeployment", { deploymentName: Schema.String }) {}

export class AmbiguousDeployment extends Schema.TaggedError<
  AmbiguousDeployment,
  { readonly brand: unique symbol }
>()("AmbiguousDeployment", {
  projectId: Schema.Finite,
  reference: Schema.String,
}) {}

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const attributes = Effect.fn("Deployment.attributes")(function* (
    deployment: PlatformDeploymentResponse,
  ) {
    if (deployment.kind !== "cloud")
      return yield* UnsupportedLocalDeployment.make({
        deploymentName: deployment.name,
      });
    return {
      projectId: deployment.projectId,
      name: deployment.name,
      reference: deployment.reference,
      type: deployment.deploymentType,
      url: deployment.deploymentUrl,
      region: deployment.region,
    } satisfies DeploymentAttributes;
  });
  const find = Effect.fn("Deployment.find")(function* (
    projectId: number,
    reference: string,
  ) {
    const deployments = yield* client.listDeployments(projectId);
    const matches = Arr.filter(
      deployments,
      (deployment) =>
        deployment.kind === "cloud" && deployment.reference === reference,
    );
    if (matches.length > 1)
      return yield* AmbiguousDeployment.make({ projectId, reference });
    return matches[0];
  });
  const validate = Effect.fn("Deployment.validate")(function* (
    current: DeploymentAttributes,
    news: DeploymentProps,
  ) {
    for (const field of ["projectId", "type", "region"] as const) {
      if (news[field] !== undefined && current[field] !== news[field])
        return yield* DeploymentIdentityChange.make({
          deploymentName: current.name,
          field,
          current: String(current[field]),
          requested: String(news[field]),
        });
    }
  });
  return {
    diff: Effect.fn("Deployment.diff")(function* ({ news, output }) {
      if (!isResolved(news) || output === undefined) return;
      yield* validate(output, news);
      const deployment = yield* client
        .getDeployment(output.name)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
      if (deployment === undefined) return { action: "update" };
      const current = yield* attributes(deployment);
      yield* validate(current, news);
      if ((news.reference ?? output.reference) !== current.reference)
        return { action: "update" };
    }),
    read: Effect.fn("Deployment.read")(function* ({
      fqn,
      instanceId,
      olds,
      output,
    }) {
      if (output !== undefined) {
        const deployment = yield* client
          .getDeployment(output.name)
          .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
        return deployment !== undefined
          ? yield* attributes(deployment)
          : undefined;
      }
      if (olds.projectId === undefined) return;
      const deployment = yield* find(
        olds.projectId,
        olds.reference ?? (yield* resourceName("deployment", fqn, instanceId)),
      );
      if (deployment === undefined) return;
      const current = yield* attributes(deployment);
      return Unowned(current);
    }),
    reconcile: Effect.fn("Deployment.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      output,
    }) {
      if (output === undefined) yield* checkpointCreate(fqn, instanceId, news);
      if (output !== undefined) yield* validate(output, news);
      let deployment =
        output !== undefined
          ? yield* client
              .getDeployment(output.name)
              .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void))
          : undefined;
      const reference =
        news.reference ??
        output?.reference ??
        (yield* resourceName("deployment", fqn, instanceId));
      if (deployment === undefined) {
        const existing = yield* find(news.projectId, reference);
        if (existing !== undefined && !(yield* shouldAdopt(fqn)))
          return yield* new OwnedBySomeoneElse({
            message: "An existing deployment requires explicit adoption.",
            resourceType: Deployment.Type,
            physicalName: reference,
          });
        if (existing !== undefined) {
          const adopted = yield* attributes(existing);
          yield* validate(adopted, news);
          yield* checkpointCreate(fqn, instanceId, news, adopted);
          deployment = existing;
        } else {
          deployment = yield* client.createDeployment(news.projectId, {
            type: news.type,
            reference,
            ...(news.region === undefined ? {} : { region: news.region }),
          });
        }
      }
      const current = yield* attributes(deployment);
      yield* validate(current, news);
      if (current.reference !== reference) {
        const existing = yield* find(news.projectId, reference);
        if (existing !== undefined && existing.name !== current.name)
          return yield* new OwnedBySomeoneElse({
            message: "The requested deployment reference is already in use.",
            resourceType: Deployment.Type,
            physicalName: reference,
          });
        yield* client.updateDeployment(current.name, {
          reference,
        });
        deployment = yield* client.getDeployment(current.name);
      }
      return yield* attributes(deployment);
    }),
    delete: Effect.fn("Deployment.delete")(function* ({ output }) {
      yield* client
        .deleteDeployment(output.name)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<Deployment>;
});

export const layer = Provider.effect(Deployment, provider);
