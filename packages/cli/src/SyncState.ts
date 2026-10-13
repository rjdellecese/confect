import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import type { Kind, OptionalFile } from "./EntryPoint";
import type { ImplModulePath } from "./ImplModulePath";

export type Work = Data.TaggedEnum<{
  None: {};
  Full: {};
  Impls: { readonly paths: Array.NonEmptyReadonlyArray<ImplModulePath> };
}>;
const Work = Data.taggedEnum<Work>();

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
        Match.tag("Spec", "Table", "Config", () => ({
          ...state,
          needsFull: true,
        })),
        Match.exhaustive,
      ),
  );
  const impls = Array.fromIterable(next.paths);
  return {
    work: next.needsFull
      ? Work.Full()
      : Array.isReadonlyArrayNonEmpty(impls)
        ? Work.Impls({ paths: impls })
        : Work.None(),
    optional: next.optional,
  };
};

export type Phase = Data.TaggedEnum<{
  Bootstrapping: {};
  NeedsFullSync: {};
  Incremental: { readonly failedImpls: HashSet.HashSet<ImplModulePath> };
}>;
export const Phase = Data.taggedEnum<Phase>();

export const requiresFullSync = (phase: Phase, pending: Pending): boolean =>
  Phase.$match(phase, {
    Bootstrapping: () => true,
    NeedsFullSync: () => true,
    Incremental: () => Work.$is("Full")(pending.work),
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
      }),
    ),
  );
