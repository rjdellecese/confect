import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as HashSet from "effect/HashSet";
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
  pending.work._tag !== "None" || !HashSet.isEmpty(pending.optional);
export const full = (pending: Pending): Pending => ({
  ...pending,
  work: Work.Full(),
});

export const add = (
  pending: Pending,
  entries: ReadonlyArray<Kind>,
  forceFull = false,
): Pending => {
  let needsFull = forceFull || pending.work._tag === "Full";
  let paths =
    pending.work._tag === "Impls"
      ? HashSet.fromIterable(pending.work.paths)
      : HashSet.empty<ImplModulePath>();
  let optional = pending.optional;
  for (const entry of entries) {
    switch (entry._tag) {
      case "Impl":
        paths = HashSet.add(paths, entry.relativePath);
        break;
      case "Http":
      case "Crons":
      case "Auth":
        optional = HashSet.add(optional, entry._tag);
        break;
      case "Spec":
      case "Table":
      case "Config":
        needsFull = true;
        break;
    }
  }
  const impls = Array.fromIterable(paths);
  return {
    work: needsFull
      ? Work.Full()
      : Array.isReadonlyArrayNonEmpty(impls)
        ? Work.Impls({ paths: impls })
        : Work.None(),
    optional,
  };
};

export type Phase = Data.TaggedEnum<{
  Bootstrapping: {};
  NeedsFullSync: {};
  Incremental: { readonly failedImpls: HashSet.HashSet<ImplModulePath> };
}>;
export const Phase = Data.taggedEnum<Phase>();

export const requiresFullSync = (phase: Phase, pending: Pending): boolean =>
  phase._tag !== "Incremental" || pending.work._tag === "Full";

export const implsToValidate = (
  phase: Phase,
  pending: Pending,
): ReadonlyArray<ImplModulePath> =>
  Array.fromIterable(
    HashSet.union(
      phase._tag === "Incremental"
        ? phase.failedImpls
        : HashSet.empty<ImplModulePath>(),
      pending.work._tag === "Impls"
        ? HashSet.fromIterable(pending.work.paths)
        : HashSet.empty<ImplModulePath>(),
    ),
  );
