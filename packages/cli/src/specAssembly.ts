import type { LeafModule } from "./modulePaths";

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
  let current = root;
  for (const segment of leaf.pathSegments) {
    const existing = current.children.get(segment);
    if (existing === undefined) {
      const next = emptySpecTreeNode();
      current.children.set(segment, next);
      current = next;
    } else {
      current = existing;
    }
  }
  current.leaf = leaf;
  return root;
};

export const buildSpecTree = (leaves: ReadonlyArray<LeafModule>): SpecTreeNode =>
  leaves.reduce(
    (tree, leaf) => insertLeafModule(tree, leaf),
    emptySpecTreeNode(),
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

export const collectSpecAssemblyNodes = (
  tree: SpecTreeNode,
  importPathPrefix = "../",
): ReadonlyArray<SpecAssemblyNode> =>
  [...tree.children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([segment, child]) => ({
      segment,
      ...(child.leaf === undefined
        ? {}
        : {
            importBinding: {
              importPath: `${importPathPrefix}${child.leaf.relativePath.replace(/\.ts$/, "")}`,
              exportName: child.leaf.exportName,
            },
          }),
      children: collectSpecAssemblyNodes(child, importPathPrefix),
    }));

export const collectConvexLeaves = (leaves: ReadonlyArray<LeafModule>) =>
  leaves.filter((leaf) => leaf.runtime === "Convex");

export const collectNodeLeaves = (leaves: ReadonlyArray<LeafModule>) =>
  leaves.filter((leaf) => leaf.runtime === "Node");

const emitGroupAssembly = (node: SpecAssemblyNode): string => {
  if (node.importBinding !== undefined && node.children.length === 0) {
    return node.importBinding.exportName;
  }

  const childAssembly = node.children
    .map(
      (child) =>
        `.addGroupAt(${JSON.stringify(child.segment)}, ${emitGroupAssembly(child)})`,
    )
    .join("");

  return `GroupSpec.makeAt(${JSON.stringify(node.segment)})${childAssembly}`;
};

export const emitAssembledSpec = (
  nodes: ReadonlyArray<SpecAssemblyNode>,
  runtime: "Convex" | "Node",
): string => {
  const imports = new Map<string, string>();
  const collectImports = (node: SpecAssemblyNode) => {
    if (node.importBinding !== undefined) {
      imports.set(
        node.importBinding.exportName,
        node.importBinding.importPath,
      );
    }
    node.children.forEach(collectImports);
  };
  nodes.forEach(collectImports);

  const importLines = [...imports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([exportName, importPath]) =>
        `import ${exportName} from "${importPath}";`,
    );

  const specFactory = runtime === "Convex" ? "Spec.make()" : "Spec.makeNode()";
  const groupFactory =
    runtime === "Convex" ? "GroupSpec.makeAt" : "GroupSpec.makeNodeAt";
  const needsGroupSpec = nodes.some((node) => node.children.length > 0);

  const rootAssembly = nodes
    .map((node) => {
      if (node.importBinding !== undefined && node.children.length === 0) {
        return `.addAt(${JSON.stringify(node.segment)}, ${node.importBinding.exportName})`;
      }

      const childAssembly = node.children
        .map(
          (child) =>
            `.addGroupAt(${JSON.stringify(child.segment)}, ${emitGroupAssembly(child)})`,
        )
        .join("");

      return `.addAt(${JSON.stringify(node.segment)}, ${groupFactory}(${JSON.stringify(node.segment)})${childAssembly})`;
    })
    .join("");

  const coreImports = needsGroupSpec ? "GroupSpec, Spec" : "Spec";

  return [
    `import { ${coreImports} } from "@confect/core";`,
    ...importLines,
    "",
    `export default ${specFactory}${rootAssembly};`,
    "",
  ].join("\n");
};

