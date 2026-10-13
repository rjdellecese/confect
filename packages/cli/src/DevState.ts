import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ImplModulePath } from "./ImplModulePath";

export type EntryKind = Data.TaggedEnum<{
  Spec: { readonly relativePath: string };
  Impl: { readonly relativePath: ImplModulePath };
  Table: { readonly relativePath: string };
  Http: { readonly relativePath: "http.ts" };
  Crons: { readonly relativePath: "crons.ts" };
  Auth: { readonly relativePath: "auth.ts" };
  Config: {};
}>;

export const EntryKind = Data.taggedEnum<EntryKind>();
export type EntryPoint = EntryKind & {
  readonly absolutePath: string;
  readonly inputPath: string;
};
export type OptionalFile = "Http" | "Crons" | "Auth";

export const parseEntry = (
  relativePath: string,
): Option.Option<Exclude<EntryKind, { readonly _tag: "Config" }>> => {
  if (relativePath === "http.ts")
    return Option.some(EntryKind.Http({ relativePath }));
  if (relativePath === "crons.ts")
    return Option.some(EntryKind.Crons({ relativePath }));
  if (relativePath === "auth.ts")
    return Option.some(EntryKind.Auth({ relativePath }));
  if (
    relativePath.split(/[/\\]/)[0] === "tables" &&
    relativePath.endsWith(".ts")
  )
    return Option.some(EntryKind.Table({ relativePath }));
  if (relativePath.endsWith(".spec.ts"))
    return Option.some(EntryKind.Spec({ relativePath }));
  return Schema.decodeOption(ImplModulePath)(relativePath).pipe(
    Option.map((implPath) => EntryKind.Impl({ relativePath: implPath })),
  );
};

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
  entries: ReadonlyArray<EntryKind>,
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
