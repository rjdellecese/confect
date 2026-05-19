import type {
  ActionMeta as ConvexActionMeta,
  DeploymentMetadata,
  FunctionMetadata,
  MutationMeta as ConvexMutationMeta,
  QueryMeta as ConvexQueryMeta,
  RequestMetadata,
  TransactionMetrics,
} from "convex/server";
import { Context, Effect, Layer } from "effect";

const makeQuery = (meta: ConvexQueryMeta) => ({
  getFunctionMetadata: (): Effect.Effect<FunctionMetadata> =>
    Effect.promise(() => meta.getFunctionMetadata()),
  getTransactionMetrics: (): Effect.Effect<TransactionMetrics> =>
    Effect.promise(() => meta.getTransactionMetrics()),
  getDeploymentMetadata: (): Effect.Effect<DeploymentMetadata> =>
    Effect.promise(() => meta.getDeploymentMetadata()),
});

const makeMutation = (meta: ConvexMutationMeta) => ({
  ...makeQuery(meta),
  getRequestMetadata: (): Effect.Effect<RequestMetadata> =>
    Effect.promise(() => meta.getRequestMetadata()),
});

const makeAction = (meta: ConvexActionMeta) => ({
  getFunctionMetadata: (): Effect.Effect<FunctionMetadata> =>
    Effect.promise(() => meta.getFunctionMetadata()),
  getDeploymentMetadata: (): Effect.Effect<DeploymentMetadata> =>
    Effect.promise(() => meta.getDeploymentMetadata()),
  getRequestMetadata: (): Effect.Effect<RequestMetadata> =>
    Effect.promise(() => meta.getRequestMetadata()),
});

export class QueryMeta extends Context.Service<
  QueryMeta,
  ReturnType<typeof makeQuery>
>()("@confect/server/Meta/QueryMeta") {
  static readonly layer = (meta: ConvexQueryMeta) =>
    Layer.succeed(this, makeQuery(meta));
}

export class MutationMeta extends Context.Service<
  MutationMeta,
  ReturnType<typeof makeMutation>
>()("@confect/server/Meta/MutationMeta") {
  static readonly layer = (meta: ConvexMutationMeta) =>
    Layer.succeed(this, makeMutation(meta));
}

export class ActionMeta extends Context.Service<
  ActionMeta,
  ReturnType<typeof makeAction>
>()("@confect/server/Meta/ActionMeta") {
  static readonly layer = (meta: ConvexActionMeta) =>
    Layer.succeed(this, makeAction(meta));
}
