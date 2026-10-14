import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as HashSet from "effect/HashSet";
import * as HashMap from "effect/HashMap";
import * as Match from "effect/Match";
import type { Declaration, Kind, OptionalFile } from "./EntryPoint";
import type { ImplModulePath } from "./ImplModulePath";
import type { GenerationSnapshot } from "./GenerationSnapshot";

export type Work = Data.TaggedEnum<{
  None: {};
  Full: {};
  Impls: { readonly paths: Array.NonEmptyReadonlyArray<ImplModulePath> };
  Declarations: {
    readonly entries: Array.NonEmptyReadonlyArray<Declaration>;
    readonly paths: ReadonlyArray<ImplModulePath>;
  };
}>;
export const Work = Data.taggedEnum<Work>();

export interface Pending {
  readonly work: Work;
  readonly optional: HashSet.HashSet<OptionalFile>;
}

export const empty: Pending = { work: Work.None(), optional: HashSet.empty() };
export const isDirty = (pending: Pending): boolean =>
  !Work.$is("None")(pending.work) || !HashSet.isEmpty(pending.optional);
export const full = (pending: Pending): Pending => ({
  ...pending,
  work: Work.Full(),
});

export const add = (
  pending: Pending,
  entries: ReadonlyArray<Kind>,
  forceFull = false,
): Pending => {
  const next = Array.reduce(
    entries,
    {
      needsFull: forceFull || Work.$is("Full")(pending.work),
      paths: Work.$match(pending.work, {
        None: () => HashSet.empty<ImplModulePath>(),
        Full: () => HashSet.empty<ImplModulePath>(),
        Impls: ({ paths }) => HashSet.fromIterable(paths),
        Declarations: ({ paths }) => HashSet.fromIterable(paths),
      }),
      declarations: Work.$match(pending.work, {
        None: () => HashMap.empty<string, Declaration>(),
        Full: () => HashMap.empty<string, Declaration>(),
        Impls: () => HashMap.empty<string, Declaration>(),
        Declarations: ({ entries: declarations }) =>
          HashMap.fromIterable(
            declarations.map(
              (entry) =>
                [`${entry._tag}:${entry.relativePath}`, entry] as const,
            ),
          ),
      }),
      optional: pending.optional,
    },
    (state, entry) =>
      Match.value(entry).pipe(
        Match.tag("Impl", ({ relativePath }) => ({
          ...state,
          paths: HashSet.add(state.paths, relativePath),
        })),
        Match.tag("Http", "Crons", "Auth", ({ _tag }) => ({
          ...state,
          optional: HashSet.add(state.optional, _tag),
        })),
        Match.tag("Spec", "Table", (declaration) => ({
          ...state,
          declarations: HashMap.set(
            state.declarations,
            `${declaration._tag}:${declaration.relativePath}`,
            declaration,
          ),
        })),
        Match.tag("Config", () => ({
          ...state,
          needsFull: true,
        })),
        Match.exhaustive,
      ),
  );
  const impls = Array.fromIterable(next.paths);
  const declarations = Array.fromIterable(HashMap.values(next.declarations));
  return {
    work: next.needsFull
      ? Work.Full()
      : Array.isReadonlyArrayNonEmpty(declarations)
        ? Work.Declarations({ entries: declarations, paths: impls })
        : Array.isReadonlyArrayNonEmpty(impls)
          ? Work.Impls({ paths: impls })
          : Work.None(),
    optional: next.optional,
  };
};

export type Phase = Data.TaggedEnum<{
  Bootstrapping: {};
  NeedsFullSync: {};
  Incremental: {
    readonly failedImpls: HashSet.HashSet<ImplModulePath>;
    readonly snapshot: GenerationSnapshot;
  };
}>;
export const Phase = Data.taggedEnum<Phase>();

export type Outcome = Data.TaggedEnum<{
  Succeeded: { readonly snapshot: GenerationSnapshot };
  GenerationFailed: {};
  ReconciliationFailed: {};
  ValidationFailed: {
    readonly snapshot: GenerationSnapshot;
    readonly paths: Array.NonEmptyReadonlyArray<ImplModulePath>;
  };
}>;
export const Outcome = Data.taggedEnum<Outcome>();

export const transition = (outcome: Outcome): Phase =>
  Outcome.$match(outcome, {
    Succeeded: ({ snapshot }) =>
      Phase.Incremental({
        snapshot,
        failedImpls: HashSet.empty(),
      }),
    GenerationFailed: () => Phase.NeedsFullSync(),
    ReconciliationFailed: () => Phase.NeedsFullSync(),
    ValidationFailed: ({ snapshot, paths }) =>
      Phase.Incremental({
        snapshot,
        failedImpls: HashSet.fromIterable(paths),
      }),
  });

export const shouldRetry = (phase: Phase, outcome: Outcome): boolean =>
  Phase.$is("Bootstrapping")(phase) && Outcome.$is("GenerationFailed")(outcome);

export const needsDeploymentNotification = (phase: Phase): boolean =>
  Phase.$match(phase, {
    Bootstrapping: () => true,
    NeedsFullSync: () => true,
    Incremental: ({ failedImpls }) => !HashSet.isEmpty(failedImpls),
  });

export const implsToValidate = (
  phase: Phase,
  pending: Pending,
): ReadonlyArray<ImplModulePath> =>
  Array.fromIterable(
    HashSet.union(
      Phase.$match(phase, {
        Bootstrapping: () => HashSet.empty<ImplModulePath>(),
        NeedsFullSync: () => HashSet.empty<ImplModulePath>(),
        Incremental: ({ failedImpls }) => failedImpls,
      }),
      Work.$match(pending.work, {
        None: () => HashSet.empty<ImplModulePath>(),
        Full: () => HashSet.empty<ImplModulePath>(),
        Impls: ({ paths }) => HashSet.fromIterable(paths),
        Declarations: ({ paths }) => HashSet.fromIterable(paths),
      }),
    ),
  );

export type Operation = Data.TaggedEnum<{
  Generate: {};
  Validate: {
    readonly snapshot: GenerationSnapshot;
    readonly paths: ReadonlyArray<ImplModulePath>;
  };
  Update: {
    readonly snapshot: GenerationSnapshot;
    readonly declarations: Array.NonEmptyReadonlyArray<Declaration>;
    readonly paths: ReadonlyArray<ImplModulePath>;
  };
}>;
export const Operation = Data.taggedEnum<Operation>();

export const plan = (phase: Phase, pending: Pending): Operation =>
  Phase.$match(phase, {
    Bootstrapping: () => Operation.Generate(),
    NeedsFullSync: () => Operation.Generate(),
    Incremental: (ready) =>
      Match.value(pending.work).pipe(
        Match.tag("Full", () => Operation.Generate()),
        Match.tag("None", "Impls", () =>
          Operation.Validate({
            snapshot: ready.snapshot,
            paths: implsToValidate(ready, pending),
          }),
        ),
        Match.tag("Declarations", ({ entries }) =>
          Operation.Update({
            snapshot: ready.snapshot,
            declarations: entries,
            paths: implsToValidate(ready, pending),
          }),
        ),
        Match.exhaustive,
      ),
  });
