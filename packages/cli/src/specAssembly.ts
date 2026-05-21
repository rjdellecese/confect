import type { LeafModule } from "./modulePaths";
import { Array, Order, pipe, Record } from "effect";

export interface SpecTreeNode {
  readonly children: Map<string, SpecTreeNode>;
  leaf?: LeafModule;
}

export const emptySpecTreeNode = (): SpecTreeNode => ({
  children: new Map(),
});

export const insertLeafModule = (
  root: SpecTreeNode,
  leaf: LeafModule,
): SpecTreeNode => {
  const terminal = Array.reduce(leaf.pathSegments, root, (current, segment) => {
    const existing = current.children.get(segment);
    if (existing !== undefined) {
      return existing;
    }
    const next = emptySpecTreeNode();
    current.children.set(segment, next);
    return next;
  });
  terminal.leaf = leaf;
  return root;
};

export const buildSpecTree = (
  leaves: ReadonlyArray<LeafModule>,
): SpecTreeNode =>
  Array.reduce(leaves, emptySpecTreeNode(), (tree, leaf) =>
    insertLeafModule(tree, leaf),
  );

export interface SpecImportBinding {
  readonly importPath: string;
  readonly exportName: string;
}

export interface SpecAssemblyNode {
  readonly segment: string;
  readonly importBinding?: SpecImportBinding;
  readonly children: ReadonlyArray<SpecAssemblyNode>;
}

const sortedChildEntries = (children: Map<string, SpecTreeNode>) =>
  pipe(
    Array.fromIterable(children.entries()),
    Array.sortBy(Order.mapInput(Order.string, ([segment]) => segment)),
  );

export const collectSpecAssemblyNodes = (
  tree: SpecTreeNode,
): ReadonlyArray<SpecAssemblyNode> =>
  pipe(
    sortedChildEntries(tree.children),
    Array.map(([segment, child]) => ({
      segment,
      ...(child.leaf === undefined
        ? {}
        : {
            importBinding: {
              importPath: child.leaf.specImportPath,
              exportName: child.leaf.exportName,
            },
          }),
      children: collectSpecAssemblyNodes(child),
    })),
  );

export const collectConvexLeaves = (leaves: ReadonlyArray<LeafModule>) =>
  Array.filter(leaves, (leaf) => leaf.runtime === "Convex");

export const collectNodeLeaves = (leaves: ReadonlyArray<LeafModule>) =>
  Array.filter(leaves, (leaf) => leaf.runtime === "Node");

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
