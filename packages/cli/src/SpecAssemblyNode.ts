import type { LeafModule } from "./LeafModule";
import { Array, Order, pipe, Record } from "effect";

export interface SpecImportBinding {
  readonly importPath: string;
  readonly exportName: string;
}

export interface SpecAssemblyNode {
  readonly segment: string;
  readonly importBinding?: SpecImportBinding;
  readonly children: ReadonlyArray<SpecAssemblyNode>;
}

const importBindingFromLeaf = (leaf: LeafModule): SpecImportBinding => ({
  importPath: leaf.specImportPath,
  exportName: leaf.exportName,
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
      const terminal = groupLeaves.find(
        (leaf) => leaf.pathSegments.length === depth + 1,
      );
      const descendants = groupLeaves.filter(
        (leaf) => leaf.pathSegments.length > depth + 1,
      );
      return {
        segment,
        ...(terminal === undefined
          ? {}
          : { importBinding: importBindingFromLeaf(terminal) }),
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
    node.importBinding === undefined
      ? childBindings
      : Array.prepend(childBindings, node.importBinding),
  );

export const collectImportBindings = (
  nodes: ReadonlyArray<SpecAssemblyNode>,
): ReadonlyArray<SpecImportBinding> =>
  pipe(
    Array.flatMap(nodes, importBindingsForNode),
    (bindings) =>
      Record.fromIterableBy(bindings, (binding) => binding.exportName),
    Record.toEntries,
    Array.sortBy(Order.mapInput(Order.string, ([exportName]) => exportName)),
    Array.map(([, binding]) => binding),
  );
