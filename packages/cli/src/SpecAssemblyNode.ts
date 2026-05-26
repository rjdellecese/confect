import type { LeafModule } from "./LeafModule";
import { Array, Option, Order, pipe, Record } from "effect";

export interface SpecImportBinding {
  readonly importPath: string;
  readonly exportName: string;
  readonly localName: string;
}

export interface SpecAssemblyNode {
  readonly segment: string;
  readonly importBinding: Option.Option<SpecImportBinding>;
  readonly children: ReadonlyArray<SpecAssemblyNode>;
}

const importBindingFromLeaf = (leaf: LeafModule): SpecImportBinding => ({
  importPath: leaf.specImportPath,
  exportName: leaf.exportName,
  localName: leaf.pathSegments.join("_"),
});

const assemblyNodesAtDepth = (
  leaves: ReadonlyArray<LeafModule>,
  depth: number,
): ReadonlyArray<SpecAssemblyNode> =>
  pipe(
    Array.groupBy(leaves, (leaf) => leaf.pathSegments[depth]!),
    Record.toEntries,
    Array.sortBy(Order.mapInput(Order.string, ([segment]) => segment)),
    Array.map(([segment, groupLeaves]) => {
      const terminal = Array.findFirst(
        groupLeaves,
        (leaf) => leaf.pathSegments.length === depth + 1,
      );
      const descendants = Array.filter(
        groupLeaves,
        (leaf) => leaf.pathSegments.length > depth + 1,
      );
      return {
        segment,
        importBinding: Option.map(terminal, importBindingFromLeaf),
        children: assemblyNodesAtDepth(descendants, depth + 1),
      };
    }),
  );

export const assemblyNodesFromLeaves = (
  leaves: ReadonlyArray<LeafModule>,
): ReadonlyArray<SpecAssemblyNode> => assemblyNodesAtDepth(leaves, 0);

export const partitionByRuntime = (
  leaves: ReadonlyArray<LeafModule>,
): {
  readonly convex: ReadonlyArray<LeafModule>;
  readonly node: ReadonlyArray<LeafModule>;
} => {
  const [node, convex] = Array.partition(
    leaves,
    (leaf) => leaf.runtime === "Convex",
  );
  return { convex, node };
};

const importBindingsForNode = (
  node: SpecAssemblyNode,
): ReadonlyArray<SpecImportBinding> =>
  pipe(node.children, Array.flatMap(importBindingsForNode), (childBindings) =>
    Option.match(node.importBinding, {
      onNone: () => childBindings,
      onSome: (binding) => Array.prepend(childBindings, binding),
    }),
  );

export const collectImportBindings = (
  nodes: ReadonlyArray<SpecAssemblyNode>,
): ReadonlyArray<SpecImportBinding> =>
  pipe(
    Array.flatMap(nodes, importBindingsForNode),
    (bindings) =>
      Record.fromIterableBy(bindings, (binding) => binding.importPath),
    Record.toEntries,
    Array.map(([, binding]) => binding),
    Array.sortBy(Order.mapInput(Order.string, (binding) => binding.localName)),
  );
