import * as Client from "@confect/alchemy/ConvexClient";
import * as Key from "@confect/alchemy/DeployKey";
import { assert, expect, it } from "@effect/vitest";
import { noopSession } from "alchemy/Report";
import { Stack } from "alchemy/Stack";
import { inMemoryState, type ResourceState } from "alchemy/State";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const props = {
  deploymentName: "test-37",
  name: "writer",
  allowedActions: ["deployment:deploy"],
} satisfies Key.DeployKeyProps;
const input = { id: "Key", fqn: "Key", instanceId: "first" };
const material = "private-test-deploy-key";
const metadata = {
  name: props.name,
  id: 41,
  creationTime: 1,
  allowedActions: props.allowedActions,
};
const output = {
  deploymentName: props.deploymentName,
  name: props.name,
  keyId: metadata.id,
  deployKey: Redacted.make(material),
  allowedActions: props.allowedActions,
} satisfies Key.DeployKeyAttributes;
const expectedRecovery = (
  error: unknown,
  reason: Key.DeployKeyRecoveryRequired["reason"],
  keyIds: ReadonlyArray<number>,
  advice: string,
) => {
  assert.instanceOf(error, Key.DeployKeyRecoveryRequired);
  expect(error).toMatchObject({
    _tag: "DeployKeyRecoveryRequired",
    deploymentName: props.deploymentName,
    keyName: props.name,
    keyIds,
    reason,
  });
  expect(error.message).toContain(advice);
  expect(Cause.pretty(Cause.fail(error))).not.toContain(material);
};

it.effect(
  "distinguishes a missing saved secret, a missing remote key, and an existing unowned name",
  () =>
    Effect.gen(function* () {
      let remote: Client.DeployKey[] = [metadata];
      const ctx = yield* Layer.build(
        Layer.mock(Client.ConvexClient)({
          listDeployKeys: () => Effect.succeed(remote),
        }),
      );
      const provider = yield* Effect.provide(Key.provider, ctx);
      const missing = Redacted.make(material);
      Redacted.wipeUnsafe(missing);
      const read = (attributes: Key.DeployKeyAttributes | undefined) =>
        provider
          .read({ ...input, olds: props, output: attributes })
          .pipe(Effect.flip);
      const saved = yield* read({ ...output, deployKey: missing });
      expectedRecovery(
        saved,
        "missing saved secret",
        [41],
        "Restore its protected state",
      );
      const collision = yield* read(undefined);
      expectedRecovery(
        collision,
        "key name already exists",
        [41],
        "choose a different name",
      );
      remote = [];
      const notFound = yield* read(output);
      expectedRecovery(
        notFound,
        "key not found",
        [41],
        "Verify the deployment and key ID",
      );
    }),
);

it.effect(
  "requires a new resource for a requested change to an already tracked key's permissions",
  () =>
    Effect.gen(function* () {
      const ctx = yield* Layer.build(Layer.mock(Client.ConvexClient)({}));
      const provider = yield* Effect.provide(Key.provider, ctx);
      const error = yield* provider
        .diff({
          ...input,
          news: { ...props, allowedActions: ["deployment:env:write"] },
          olds: props,
          output,
          oldBindings: [],
          newBindings: [],
        })
        .pipe(Effect.flip);
      assert.instanceOf(error, Key.DeployKeyChangeRequiresNewResource);
      expect(error).toMatchObject({
        keyId: 41,
        deploymentName: props.deploymentName,
        field: "allowedActions",
      });
      expect(Cause.pretty(Cause.fail(error))).not.toContain(material);
    }),
);

it.effect(
  "distinguishes uncertain issuance from ambiguous metadata and unexpectedly granted permissions",
  () =>
    Effect.gen(function* () {
      for (const scenario of [
        "lost response",
        "absent metadata",
        "ambiguous metadata",
        "wrong permissions",
      ] as const) {
        let issues = 0;
        const revoked: (string | Redacted.Redacted<string>)[] = [];
        const issued = Redacted.make(material);
        const remote: Client.DeployKey[] = [];
        const row: ResourceState = {
          ...input,
          logicalId: input.id,
          status: "creating",
          resourceType: Key.DeployKey.Type,
          namespace: undefined,
          downstream: [],
          bindings: [],
          providerVersion: 0,
          props,
        };
        const ctx = yield* Layer.build(
          Layer.mergeAll(
            Layer.succeed(Stack, {
              name: "fixture",
              stage: "test",
              resources: {},
              actions: {},
              bindings: {},
            }),
            inMemoryState({ fixture: { test: { Key: row } } }),
            Layer.mock(Client.ConvexClient)({
              listDeployKeys: () => Effect.succeed([...remote]),
              createDeployKey: () =>
                Effect.gen(function* () {
                  issues++;
                  if (scenario === "lost response")
                    return yield* Client.ConvexApiError.make({
                      operation: "createDeployKey",
                      code: "TransportError",
                    });
                  if (scenario === "ambiguous metadata")
                    remote.push(metadata, {
                      ...metadata,
                      id: 42,
                      name: "writer (2)",
                    });
                  if (scenario === "wrong permissions")
                    remote.push({
                      ...metadata,
                      allowedActions: ["deployment:env:view"],
                    });
                  return { deployKey: issued };
                }),
              deleteDeployKey: (_name, id) =>
                Effect.sync(() => {
                  revoked.push(id);
                }),
            }),
          ),
        );
        const provider = yield* Effect.provide(Key.provider, ctx);
        const issue = provider
          .reconcile({
            ...input,
            news: props,
            olds: undefined,
            output: undefined,
            session: noopSession,
            bindings: [],
          })
          .pipe(Effect.provide(ctx), Effect.flip);
        const first = yield* issue;
        if (scenario === "lost response") {
          expect(first).toMatchObject({
            _tag: "ConvexApiError",
            code: "TransportError",
          });
          const retry = yield* issue;
          expectedRecovery(
            retry,
            "issuance uncertain",
            [],
            "Check the deployment's keys",
          );
          expect(revoked).toEqual([]);
        } else {
          if (scenario === "wrong permissions")
            expectedRecovery(
              first,
              "issued permissions differ",
              [41],
              "Verify the requested actions",
            );
          else
            expectedRecovery(
              first,
              "unverifiable issuance metadata",
              scenario === "absent metadata" ? [] : [41, 42],
              "Check for matching key names",
            );
          expect(revoked).toEqual([issued]);
        }
        expect(issues).toBe(1);
      }
    }),
);
