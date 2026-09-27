import { it, expect, assert } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import * as DeployKey from "@confect/alchemy/DeployKey";
import { key, lifecycle, mockClient } from "./fixtures/ConvexClient";

const props: DeployKey.DeployKeyProps = {
  deploymentName: "happy-otter-123",
  name: "example",
};

it.effect(
  "preserves the one-time secret across repeated reconciliation and read",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* DeployKey.provider;
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });

      const second = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: first,
      });
      expect(Redacted.isRedacted(second.deployKey)).toBe(true);
      expect(second.deployKey).toBe(first.deployKey);
      const observed = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: first,
      });
      expect(observed?.deployKey).toBe(first.deployKey);
      expect(mock.client.createDeployKey).toHaveBeenCalledTimes(1);
      expect(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
          second,
        ),
      ).not.toContain("test-secret");
    }).pipe(Effect.provide(mock.layer));
  },
);

it.effect(
  "requires explicit recovery for cold or ambiguous keys without rotating",
  () => {
    const mock = mockClient();
    mock.state.keys = [key(), key({ id: 2 })];
    return Effect.gen(function* () {
      const provider = yield* DeployKey.provider;
      const readError = yield* Effect.flip(
        provider.read({ ...lifecycle, olds: props, output: undefined }),
      );
      assert(readError._tag === "DeployKeyRecoveryRequired");
      expect(readError.keyIds).toEqual([1, 2]);
      const reconcileError = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news: props,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(reconcileError._tag).toBe("DeployKeyRecoveryRequired");
      expect(mock.client.createDeployKey).not.toHaveBeenCalled();
      expect(mock.client.deleteDeployKey).not.toHaveBeenCalled();
    }).pipe(Effect.provide(mock.layer));
  },
);

it.effect(
  "detects secret loss after creation and never silently retries issuance",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* DeployKey.provider;
      const news = { deploymentName: props.deploymentName };
      yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: undefined,
      });
      const error = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(error._tag).toBe("DeployKeyRecoveryRequired");
      expect(mock.client.createDeployKey).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(mock.layer));
  },
);

it.effect(
  "refuses key changes or remote revocation and deletes only its key id",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* DeployKey.provider;
      const output = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });
      for (const news of [
        { ...props, name: "renamed" },
        { ...props, deploymentName: "different" },
        { ...props, allowedActions: ["deployment:env:view" as const] },
      ]) {
        const error = yield* Effect.flip(
          provider.reconcile({ ...lifecycle, news, olds: props, output }),
        );
        expect(error._tag).toBe("DeployKeyChangeRequiresNewResource");
      }
      mock.state.keys = [];
      const missing = yield* Effect.flip(
        provider.reconcile({ ...lifecycle, news: props, olds: props, output }),
      );
      expect(missing._tag).toBe("DeployKeyRecoveryRequired");
      mock.state.keys = [key(), key({ id: 2 })];
      yield* provider.delete({ ...lifecycle, olds: props, output });
      yield* provider.delete({ ...lifecycle, olds: props, output });
      expect(mock.state.keys.map((value) => value.id)).toEqual([2]);
      expect(mock.client.createDeployKey).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(mock.layer));
  },
);

it.effect(
  "observes key revocation and permission drift during planning",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* DeployKey.provider;
      const output = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });
      const input = {
        ...lifecycle,
        olds: props,
        news: props,
        output,
        oldBindings: [],
        newBindings: [],
      };
      expect(yield* provider.diff(input)).toBeUndefined();
      mock.state.keys = [key({ allowedActions: ["deployment:env:view"] })];
      expect((yield* Effect.flip(provider.diff(input)))._tag).toBe(
        "DeployKeyChangeRequiresNewResource",
      );
      mock.state.keys = [];
      expect((yield* Effect.flip(provider.diff(input)))._tag).toBe(
        "DeployKeyRecoveryRequired",
      );
      expect(mock.client.createDeployKey).toHaveBeenCalledTimes(1);
      expect(mock.client.deleteDeployKey).not.toHaveBeenCalled();
    }).pipe(Effect.provide(mock.layer));
  },
);
