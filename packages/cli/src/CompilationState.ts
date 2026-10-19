import type * as esbuild from "esbuild";
import * as Schema from "effect/Schema";
import * as Array from "effect/Array";
import { identity } from "effect/Function";
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
  readonly configuration: string | undefined;
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
  configuration: string | undefined,
): boolean =>
  current.profile === profile &&
  current.configuration === configuration &&
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
    (context) =>
      !compatible(
        incoming,
        context.profile,
        context.roots,
        context.configuration,
      ),
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

export function* reachable<
  A extends {
    readonly imports: ReadonlyArray<{
      readonly path: string;
      readonly external?: boolean;
    }>;
  },
>(
  entries: Readonly<Record<string, A>>,
  roots: ReadonlyArray<string>,
  resolveImport: (file: string) => string = identity,
): Generator<readonly [string, A]> {
  const visited = new Set(roots);
  const pending = [...visited];
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index];
    if (file === undefined) continue;
    const metadata = entries[file];
    if (!metadata) continue;
    yield [file, metadata];
    for (const imported of metadata.imports) {
      if (imported.external) continue;
      const next = resolveImport(imported.path);
      if (visited.has(next)) continue;
      visited.add(next);
      pending.push(next);
    }
  }
}

const byPath = Order.mapInput(
  Order.String,
  (pair: readonly [string, string]) => pair[0],
);

export const makeInputFingerprinter = (
  metafile: esbuild.Metafile,
  hashes: Values,
  generated: ReadonlyArray<string> = [],
) => {
  const excluded = new Set(generated);
  const serialized = new Map<string, string>();
  return (root: string): string => {
    const files: string[] = [];
    for (const [file, metadata] of reachable(metafile.inputs, [root])) {
      if (excluded.has(file)) continue;
      if (!serialized.has(file))
        serialized.set(
          file,
          JSON.stringify([
            file,
            JSON.stringify([hashes[file], metadata.imports]),
          ]),
        );
      files.push(file);
    }
    return `{"inputs":[${files
      .sort()
      .map((file) => serialized.get(file))
      .join(",")}]}`;
  };
};

export const fingerprintInput = (
  metafile: esbuild.Metafile,
  hashes: Values,
  root: string,
  generated: ReadonlyArray<string> = [],
): string => makeInputFingerprinter(metafile, hashes, generated)(root);

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
