import { ConvexClient } from "@confect/alchemy/ConvexClient";
import { it, expect } from "@effect/vitest";
import { AdoptPolicy, Unowned } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";

import * as Deployment from "@confect/alchemy/Deployment";
import { deployment, lifecycle, mockClient } from "./fixtures/ConvexClient";

const props: Deployment.DeploymentProps = {
  projectId: 1,
  type: "prod",
  reference: "example",
};
const attrs: Deployment.DeploymentAttributes = {
  projectId: 1,
  type: "prod",
  name: "happy-otter-123",
  reference: "example",
  region: "aws-us-east-1",
  url: "https://happy-otter-123.convex.cloud",
};

it.effect(
  "reconciles repeatedly and repairs reference drift without replacement",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });
      yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: first,
      });
      expect(mock.client.createDeployment).toHaveBeenCalledTimes(1);
      expect(mock.client.updateDeployment).not.toHaveBeenCalled();
      mock.state.deployments = [deployment({ reference: "drift" })];
      const observed = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: first,
      });
      expect(observed?.reference).toBe("drift");
      const diffResult = yield* provider.diff({
        ...lifecycle,
        olds: props,
        news: props,
        output: first,
        oldBindings: [],
        newBindings: [],
      });
      expect(diffResult).toEqual({ action: "update" });
      const updated = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: observed,
      });
      expect(updated.reference).toBe("example");
      expect(mock.client.updateDeployment).toHaveBeenCalledTimes(1);
      expect(mock.client.deleteDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "requires adoption of reference matches and rejects duplicate references",
  () => {
    const mock = mockClient();
    mock.state.deployments = [deployment()];
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const found = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: undefined,
      });
      expect(Unowned.is(found)).toBe(true);
      const collision = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news: props,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(collision._tag).toBe("OwnedBySomeoneElse");
      yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: found,
      });
      mock.state.deployments.push(deployment({ name: "other-deployment-456" }));
      const ambiguous = yield* Effect.flip(
        provider.read({ ...lifecycle, olds: props, output: undefined }),
      );
      expect(ambiguous._tag).toBe("AmbiguousDeployment");
      expect(mock.client.createDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect("never replaces data when project, type, or region changes", () => {
  const mock = mockClient();
  mock.state.deployments = [deployment()];
  return Effect.gen(function* () {
    const provider = yield* Deployment.provider;
    for (const changed of [
      { projectId: 2 },
      { type: "dev" as const },
      { region: "aws-eu-west-1" as const },
    ]) {
      const error = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news: { ...props, ...changed },
          olds: props,
          output: attrs,
        }),
      );
      expect(error._tag).toBe("DeploymentIdentityChange");
    }
    expect(mock.client.createDeployment).not.toHaveBeenCalled();
    expect(mock.client.deleteDeployment).not.toHaveBeenCalled();
    expect(mock.client.updateDeployment).not.toHaveBeenCalled();
    yield* provider.delete({ ...lifecycle, olds: props, output: attrs });
    yield* provider.delete({ ...lifecycle, olds: props, output: attrs });
    expect(mock.client.deleteDeployment).toHaveBeenCalledTimes(1);
    const readResult = yield* provider.read({
      ...lifecycle,
      olds: props,
      output: attrs,
    });
    expect(readResult).toBeUndefined();
  }).pipe(Effect.provideService(ConvexClient, mock.client));
});

it.effect.each([
  { type: "dev" as const },
  { region: "aws-eu-west-1" as const },
])(
  "does not claim or destroy an incompatible reference match: %o",
  (change) => {
    const mock = mockClient();
    mock.state.deployments = [deployment()];
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const news = { ...props, ...change };
      const input = { ...lifecycle, olds: news, output: undefined };
      const found = yield* provider.read(input);
      expect(found).toBeUndefined();
      const error = yield* provider
        .reconcile({ ...input, news, olds: undefined })
        .pipe(Effect.provideService(AdoptPolicy, true), Effect.flip);
      expect(error._tag).toBe("DeploymentIdentityChange");
      const deletion = yield* Effect.flip(
        provider.delete({ ...input, output: attrs }),
      );
      expect(deletion._tag).toBe("DeploymentIdentityChange");
      expect(mock.client.createDeployment).not.toHaveBeenCalled();
      expect(mock.client.deleteDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "refuses to destroy a deployment transferred to another project",
  () => {
    const mock = mockClient();
    mock.state.deployments = [deployment({ projectId: 2 })];
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const error = yield* Effect.flip(
        provider.delete({ ...lifecycle, olds: props, output: attrs }),
      );
      expect(error).toMatchObject({
        _tag: "DeploymentIdentityChange",
        field: "projectId",
        current: "2",
        requested: "1",
      });
      expect(mock.client.deleteDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect.each([undefined, "initial"])(
  "repairs the managed reference after observation and an FQN move, initial reference=%s",
  (reference) => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const news = { projectId: 1, type: "prod" as const };
      const initial = reference === undefined ? news : { ...news, reference };
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: initial,
        olds: undefined,
        output: undefined,
      });
      const renamed = { ...lifecycle, fqn: "migrated" };
      mock.state.deployments = [deployment({ reference: "external" })];
      const observed = yield* provider.read({
        ...renamed,
        olds: initial,
        output: first,
      });
      expect(observed?.reference).toBe("external");
      const restored = yield* provider.reconcile({
        ...renamed,
        news,
        olds: initial,
        output: observed,
      });
      expect(restored).toEqual(first);
      expect(mock.client.updateDeployment).toHaveBeenCalledWith(first.name, {
        reference: first.reference,
      });
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "observes missing deployments and unsafe live identity drift during planning",
  () => {
    const mock = mockClient();
    mock.state.deployments = [deployment()];
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const input = {
        ...lifecycle,
        olds: props,
        news: props,
        output: attrs,
        oldBindings: [],
        newBindings: [],
      };
      const diffResult2 = yield* provider.diff(input);
      expect(diffResult2).toBeUndefined();
      mock.state.deployments = [];
      const diffResult3 = yield* provider.diff(input);
      expect(diffResult3).toEqual({ action: "update" });
      mock.state.deployments = [deployment({ projectId: 2 })];
      const diffResult4 = yield* Effect.flip(provider.diff(input));
      expect(diffResult4._tag).toBe("DeploymentIdentityChange");
      expect(mock.client.createDeployment).not.toHaveBeenCalled();
      expect(mock.client.updateDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "uses deterministic references for recovery, never default deployments",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Deployment.provider;
      const news = { projectId: 1, type: "prod" as const };
      const first = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: undefined,
      });
      expect(first.reference).toMatch(/^confect-deployment-/);
      const found = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: undefined,
      });
      expect(found?.reference).toBe(first.reference);
      expect(Unowned.is(found)).toBe(true);
      const error = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(error._tag).toBe("OwnedBySomeoneElse");
      expect(mock.client.createDeployment).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);
