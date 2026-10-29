import { it, expect } from "@effect/vitest";
import { Unowned } from "alchemy/AdoptPolicy";
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
      expect(
        yield* provider.diff({
          ...lifecycle,
          olds: props,
          news: props,
          output: first,
          oldBindings: [],
          newBindings: [],
        }),
      ).toEqual({ action: "update" });
      const updated = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: observed,
      });
      expect(updated.reference).toBe("example");
      expect(mock.client.updateDeployment).toHaveBeenCalledTimes(1);
      expect(mock.client.deleteDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provide(mock.layer));
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
    }).pipe(Effect.provide(mock.layer));
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
    expect(
      yield* provider.read({ ...lifecycle, olds: props, output: attrs }),
    ).toBeUndefined();
  }).pipe(Effect.provide(mock.layer));
});

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
      expect(yield* provider.diff(input)).toBeUndefined();
      mock.state.deployments = [];
      expect(yield* provider.diff(input)).toEqual({ action: "update" });
      mock.state.deployments = [deployment({ projectId: 2 })];
      expect((yield* Effect.flip(provider.diff(input)))._tag).toBe(
        "DeploymentIdentityChange",
      );
      expect(mock.client.createDeployment).not.toHaveBeenCalled();
      expect(mock.client.updateDeployment).not.toHaveBeenCalled();
    }).pipe(Effect.provide(mock.layer));
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
    }).pipe(Effect.provide(mock.layer));
  },
);
