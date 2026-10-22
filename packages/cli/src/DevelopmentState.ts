import * as Array from "effect/Array";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import type { Receipt, Revision, Topology } from "./CompilationState";
import type { EntryPoint } from "./EntryPoint";

export type Receipts = HashMap.HashMap<number, HashMap.HashMap<string, number>>;

export const empty: Receipts = HashMap.empty();

export const acknowledge = (
  previous: Receipts,
  receipts: ReadonlyArray<Receipt>,
): Receipts =>
  Array.reduce(receipts, previous, (state, receipt) => {
    const current = Option.getOrElse(HashMap.get(state, receipt.context), () =>
      HashMap.empty<string, number>(),
    );
    return HashMap.set(
      state,
      receipt.context,
      Array.reduce(receipt.roots, current, (roots, root) =>
        HashMap.set(
          roots,
          root,
          Math.max(
            receipt.revision,
            Option.getOrElse(HashMap.get(roots, root), () => 0),
          ),
        ),
      ),
    );
  });

export const pendingRoots = (
  receipts: Receipts,
  event: Revision,
): ReadonlyArray<string> => {
  const current = Option.getOrElse(HashMap.get(receipts, event.context), () =>
    HashMap.empty<string, number>(),
  );
  return Array.filter(
    event.affectedRoots,
    (root) =>
      Option.getOrElse(HashMap.get(current, root), () => 0) < event.revision,
  );
};

export const retain = (
  receipts: Receipts,
  topology: ReadonlyArray<Topology>,
): Receipts => {
  const active = HashSet.fromIterable(
    Array.map(topology, (context) => context.id),
  );
  return HashMap.filter(receipts, (_, context) => HashSet.has(active, context));
};

export const acknowledgeFailures = (
  previous: Receipts,
  failures: ReadonlyArray<Receipt>,
  coveredRoots: HashSet.HashSet<string>,
  topology: ReadonlyArray<Topology>,
): Receipts =>
  acknowledge(
    previous,
    Array.map(failures, (failure) => ({
      ...failure,
      roots: Option.match(
        Array.findFirst(topology, (context) => context.id === failure.context),
        {
          onNone: () => [],
          onSome: (context) =>
            Array.filter(context.roots, (root) =>
              HashSet.has(coveredRoots, root),
            ),
        },
      ),
    })),
  );

const inventoryKey = (entry: EntryPoint): string =>
  `${entry._tag}:${entry.absolutePath}:${entry.inputPath}`;

export const onlyConsumedImplsAdded = (
  before: ReadonlyArray<EntryPoint>,
  after: ReadonlyArray<EntryPoint>,
  consumed: ReadonlyArray<Receipt>,
  topology: ReadonlyArray<Topology>,
): boolean => {
  if (after.length <= before.length) return false;
  const previous = HashSet.fromIterable(Array.map(before, inventoryKey));
  const current = HashSet.fromIterable(Array.map(after, inventoryKey));
  if (
    !Array.every(before, (entry) => HashSet.has(current, inventoryKey(entry)))
  )
    return false;
  const contexts = HashSet.fromIterable(
    Array.flatMap(topology, (context) =>
      context.profile === "modules" ? [context.id] : [],
    ),
  );
  const covered = HashSet.fromIterable(
    Array.flatMap(consumed, (receipt) =>
      HashSet.has(contexts, receipt.context) ? receipt.roots : [],
    ),
  );
  return Array.every(
    after,
    (entry) =>
      HashSet.has(previous, inventoryKey(entry)) ||
      (entry._tag === "Impl" &&
        entry.absolutePath === entry.inputPath &&
        HashSet.has(covered, entry.inputPath)),
  );
};

export const sameInventory = (
  before: ReadonlyArray<EntryPoint>,
  after: ReadonlyArray<EntryPoint>,
): boolean => {
  const keys = HashSet.fromIterable(Array.map(before, inventoryKey));
  return (
    HashSet.size(keys) === after.length &&
    Array.every(after, (entry) => HashSet.has(keys, inventoryKey(entry)))
  );
};
