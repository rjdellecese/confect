import type * as esbuild from "esbuild";
import * as Schema from "effect/Schema";
import * as Array from "effect/Array";
import * as HashSet from "effect/HashSet";
import * as Iterable from "effect/Iterable";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Order from "effect/Order";

export type Profile = "modules" | "component-config";
export type Mode = "Once" | "Watch";

export interface Receipt {
  readonly context: number;
  readonly revision: number;
  readonly roots: ReadonlyArray<string>;
}

export interface Revision extends Receipt {
  readonly affectedRoots: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<esbuild.Message>;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

export interface Topology {
  readonly id: number;
  readonly profile: Profile;
  readonly roots: ReadonlyArray<string>;
}

export const consume = (
  receipts: ReadonlyArray<Receipt>,
  receipt: Receipt,
  roots: ReadonlyArray<string>,
): ReadonlyArray<Receipt> => {
  const existing = Array.findFirst(
    receipts,
    (item) =>
      item.context === receipt.context && item.revision === receipt.revision,
  );
  if (Option.isNone(existing))
    return Array.append(receipts, { ...receipt, roots });
  return Array.map(receipts, (item) =>
    item === existing.value
      ? { ...item, roots: Array.dedupe([...item.roots, ...roots]) }
      : item,
  );
};

export const compatible = (
  current: Topology,
  profile: Profile,
  roots: ReadonlyArray<string>,
): boolean =>
  current.profile === profile &&
  Array.every(roots, (root) => Array.contains(current.roots, root));

export const acknowledged = (
  revision: Revision,
  receipts: ReadonlyArray<Receipt>,
): boolean =>
  Array.every(revision.affectedRoots, (root) =>
    Array.some(
      receipts,
      (receipt) =>
        receipt.context === revision.context &&
        receipt.revision >= revision.revision &&
        Array.contains(receipt.roots, root),
    ),
  );

export const unacknowledgedRoots = (
  revision: Revision,
  receipts: ReadonlyArray<Receipt>,
): ReadonlyArray<string> =>
  Array.filter(
    revision.affectedRoots,
    (root) =>
      !Array.some(
        receipts,
        (receipt) =>
          receipt.context === revision.context &&
          receipt.revision >= revision.revision &&
          Array.contains(receipt.roots, root),
      ),
  );

export const retain = <A extends Topology>(
  contexts: ReadonlyArray<A>,
  incoming: Topology,
): ReadonlyArray<A> =>
  Array.filter(
    contexts,
    (context) => !compatible(incoming, context.profile, context.roots),
  );

export class Failed extends Schema.TaggedError<Failed>()("CompilationFailed", {
  cause: Schema.Unknown,
  receipt: Schema.Struct({
    context: Schema.Finite,
    revision: Schema.Finite,
    roots: Schema.Array(Schema.String),
  }),
}) {}

export type Values = Readonly<Record<string, string>>;

export const sameValues = (before: Values, after: Values): boolean =>
  Record.size(before) === Record.size(after) &&
  Record.every(before, (value, key) => after[key] === value);

const reachable = <
  A extends {
    readonly imports: ReadonlyArray<{
      readonly path: string;
      readonly external?: boolean;
    }>;
  },
>(
  entries: Readonly<Record<string, A>>,
  roots: ReadonlyArray<string>,
): ReadonlyArray<readonly [string, A]> =>
  Array.fromIterable(
    Iterable.getSomes(
      Iterable.unfold<
        {
          readonly pending: Pending | undefined;
          readonly visited: HashSet.HashSet<string>;
        },
        Option.Option<readonly [string, A]>
      >(
        {
          pending: Array.reduce<string, Pending | undefined>(
            roots,
            undefined,
            (next, file) => ({ file, next }),
          ),
          visited: HashSet.empty(),
        },
        ({ pending, visited }) => {
          if (!pending) return Option.none();
          const { file: first, next: rest } = pending;
          if (HashSet.has(visited, first))
            return Option.some([Option.none(), { pending: rest, visited }]);
          const value = entries[first];
          if (!value)
            return Option.some([
              Option.none(),
              { pending: rest, visited: HashSet.add(visited, first) },
            ]);
          return Option.some([
            Option.some([first, value] as const),
            {
              pending: Array.reduce(value.imports, rest, (queue, imported) =>
                imported.external
                  ? queue
                  : { file: imported.path, next: queue },
              ),
              visited: HashSet.add(visited, first),
            },
          ]);
        },
      ),
    ),
  );

interface Pending {
  readonly file: string;
  readonly next: Pending | undefined;
}

const byPath = Order.mapInput(
  Order.String,
  (pair: readonly [string, string]) => pair[0],
);

export const fingerprintInput = (
  metafile: esbuild.Metafile,
  hashes: Values,
  root: string,
  generated: ReadonlyArray<string> = [],
): string =>
  JSON.stringify({
    inputs: Array.sort(
      Array.getSomes(
        Array.map(reachable(metafile.inputs, [root]), ([file, metadata]) =>
          Array.contains(generated, file)
            ? Option.none()
            : Option.some([
                file,
                JSON.stringify([hashes[file], metadata.imports]),
              ] as const),
        ),
      ),
      byPath,
    ),
  });

export const fingerprintArtifacts = (hashes: Values): string =>
  JSON.stringify(Array.sort(Record.toEntries(hashes), byPath));

export const fingerprintFailure = (
  errors: ReadonlyArray<
    Pick<esbuild.Message, "id" | "pluginName" | "text" | "location" | "notes">
  >,
  inputs: Values,
): string =>
  JSON.stringify({
    errors,
    inputs: Array.sort(Record.toEntries(inputs), byPath),
  });

export const changedRoots = (
  before: Values,
  after: Values,
  roots: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.filter(roots, (root) => before[root] !== after[root]);
