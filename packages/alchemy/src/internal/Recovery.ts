import { AdoptPolicy } from "alchemy/AdoptPolicy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { Stack } from "alchemy/Stack";
import { deepEqual } from "alchemy/Diff";
import {
  State,
  isActionState,
  type PersistedState,
  type ResourceState,
} from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { ConvexClientError } from "../ConvexClient.js";

export interface Owner {
  readonly fqn: string;
  readonly instanceId: string;
  readonly type: string;
}
type Row = Extract<
  ResourceState,
  { status: "creating" | "updating" | "created" | "updated" | "deleting" }
>;
export class RecoveryUnavailable extends Schema.TaggedError<
  RecoveryUnavailable,
  { readonly brand: unique symbol }
>()("RecoveryUnavailable", {
  reason: Schema.Literals([
    "missing services",
    "not current",
    "read failed",
    "checkpoint failed",
  ]),
}) {
  override get message() {
    return `Convex mutation refused: durable recovery state ${this.reason}.`;
  }
}

const ownedRow = (
  row: PersistedState | undefined,
  owner: Owner,
  deleting: boolean,
): Result.Result<Row, RecoveryUnavailable> => {
  if (
    row === undefined ||
    isActionState(row) ||
    row.fqn !== owner.fqn ||
    row.resourceType !== owner.type ||
    row.instanceId !== owner.instanceId ||
    row.status === "replacing" ||
    row.status === "replaced" ||
    deleting !== (row.status === "deleting")
  )
    return Result.fail(RecoveryUnavailable.make({ reason: "not current" }));
  return Result.succeed(row);
};

export const access = Effect.fn("Convex.recoveryAccess")(function* (
  owner: Owner,
  deleting = false,
) {
  const stack = yield* Effect.serviceOption(Stack);
  const service = yield* Effect.serviceOption(State);
  if (Option.isNone(stack) || Option.isNone(service))
    return yield* RecoveryUnavailable.make({ reason: "missing services" });
  const address = {
    stack: stack.value.name,
    stage: stack.value.stage,
    fqn: owner.fqn,
  };
  const state = yield* service.value;
  const read = Effect.suspend(() => state.get(address)).pipe(
    Effect.mapError(() => RecoveryUnavailable.make({ reason: "read failed" })),
    Effect.flatMap((row) => Effect.fromResult(ownedRow(row, owner, deleting))),
  );
  const row = yield* read;
  const checkpoint = Effect.fn("Convex.checkpoint")(function* (next: Snapshot) {
    const current = yield* read;
    const value: ResourceState = {
      fqn: current.fqn,
      logicalId: current.logicalId,
      namespace: current.namespace,
      instanceId: current.instanceId,
      resourceType: current.resourceType,
      bindings: current.bindings,
      downstream: current.downstream,
      providerVersion: current.providerVersion,
      ...(current.removalPolicy === undefined
        ? {}
        : { removalPolicy: current.removalPolicy }),
      ...(current.adoptionBlocked === undefined
        ? {}
        : { adoptionBlocked: current.adoptionBlocked }),
      status: "creating",
      props: next.props,
      attr: next.attr,
    };
    yield* state
      .set({ ...address, value })
      .pipe(
        Effect.mapError(() =>
          RecoveryUnavailable.make({ reason: "checkpoint failed" }),
        ),
      );
    const saved = yield* read;
    const confirmed = Result.try(
      () =>
        deepEqual(saved.props, next.props) && deepEqual(saved.attr, next.attr),
    );
    if (!Result.isSuccess(confirmed) || !confirmed.success)
      return yield* RecoveryUnavailable.make({ reason: "checkpoint failed" });
  });
  return { row, checkpoint };
});

export interface Snapshot {
  readonly props: Record<string, unknown>;
  readonly attr: Record<string, unknown> | undefined;
}
export type Ownership =
  | { readonly _tag: "Unclaimed"; readonly desired: Snapshot }
  | { readonly _tag: "Managed"; readonly previous: Snapshot };
const previous = (ownership: Ownership): Snapshot =>
  ownership._tag === "Managed" ? ownership.previous : ownership.desired;
const rejected = (e: ConvexClientError) =>
  e.code === "InvalidRequest" ||
  e.code === "InvalidConfiguration" ||
  (e.code === "HttpError" &&
    e.status !== undefined &&
    [400, 401, 403, 404, 405, 409, 410, 413, 415, 422, 429].includes(e.status));

export const attempt = Effect.fn("Convex.attempt")(function* <A>(
  owner: Owner,
  before: Ownership,
  uncertain: Snapshot,
  write: () => Effect.Effect<A, ConvexClientError>,
) {
  const journal = yield* access(owner);
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      yield* journal.checkpoint(uncertain);
      return yield* restore(Effect.suspend(write)).pipe(
        Effect.tapError((e) =>
          rejected(e) ? journal.checkpoint(previous(before)) : Effect.void,
        ),
      );
    }),
  );
});

export const allowDiscovery = Effect.fn("Convex.allowDiscovery")(function* (
  owner: Owner,
) {
  const { row } = yield* access(owner);
  if (row.adoptionBlocked === "migrated-fqn") return false;
  const stack = yield* Effect.serviceOption(Stack);
  const local = Option.isSome(stack)
    ? stack.value.resources[owner.fqn]?.Adopt
    : undefined;
  if (local !== undefined) return local;
  const policy = yield* Effect.serviceOption(AdoptPolicy);
  if (Option.isSome(policy)) return policy.value;
  const run = yield* Effect.serviceOption(AlchemyContext);
  return Option.isSome(run) && run.value.adopt;
});
