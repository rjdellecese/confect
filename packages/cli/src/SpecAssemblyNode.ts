import type { LeafModule } from "./LeafModule";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { CodeBlockWriter } from "./CodeBlockWriter";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Record from "effect/Record";
import * as String from "effect/String";
import * as GenerationSnapshot from "./GenerationSnapshot";
import * as GroupPath from "./GroupPath";
import type { SnapshotError } from "./SnapshotError";

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
  localName: Array.join(leaf.pathSegments, "_"),
});

const assemblyNodesAtDepth = (
  leaves: ReadonlyArray<LeafModule>,
  depth: number,
): ReadonlyArray<SpecAssemblyNode> =>
  pipe(
    Array.groupBy(leaves, (leaf) => leaf.pathSegments[depth]!),
    Record.toEntries,
    Array.sortBy(Order.mapInput(Order.String, ([segment]) => segment)),
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

interface ScopedAssemblyNode {
  readonly path: GroupPath.GroupPath;
  readonly node: SpecAssemblyNode;
}

const scopedNodesAtPath = (
  node: SpecAssemblyNode,
  path: GroupPath.GroupPath,
): ReadonlyArray<ScopedAssemblyNode> => [
  { path, node },
  ...Array.flatMap(node.children, (child) =>
    scopedNodesAtPath(child, GroupPath.append(path, child.segment)),
  ),
];

export const scopedNodesFromLeaves = Effect.fnUntraced(function* (
  leaves: ReadonlyArray<LeafModule>,
): Effect.fn.Return<ReadonlyArray<ScopedAssemblyNode>, SnapshotError> {
  const parsedLeaves = yield* Effect.forEach(leaves, (leaf) =>
    Effect.fromResult(
      GenerationSnapshot.parseRootPath(leaf.relativePath.replaceAll("\\", "/")),
    ).pipe(
      Effect.map((relativePath) => ({
        ...leaf,
        pathSegments: String.split(
          relativePath.slice(0, -".spec.ts".length),
          "/",
        ),
      })),
    ),
  );
  return Array.flatMap(assemblyNodesFromLeaves(parsedLeaves), (node) =>
    scopedNodesAtPath(node, GroupPath.make([node.segment])),
  );
});

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
    Array.sortBy(Order.mapInput(Order.String, (binding) => binding.localName)),
  );

const writeGroupEntry = Effect.fnUntraced(function* (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
): Effect.fn.Return<void> {
  yield* cbw.write("[");
  yield* cbw.quote(node.segment);
  yield* cbw.write("]: ");
  yield* writeGroupAssembly(cbw, node);
  yield* cbw.write(",\n");
});

const writeGroupAssembly: (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
) => Effect.Effect<void> = Effect.fnUntraced(function* (cbw, node) {
  const group = Option.match(node.importBinding, {
    onNone: () => "GroupSpec.make()",
    onSome: (binding) => binding.localName,
  });
  yield* Array.match(node.children, {
    onEmpty: () => cbw.write(group),
    onNonEmpty: (children) =>
      Effect.gen(function* () {
        yield* cbw.write(`GroupSpec.addGroupsAt(${group}, {\n`);
        yield* cbw.indent(
          Effect.forEach(children, (child) => writeGroupEntry(cbw, child)),
        );
        yield* cbw.write("})");
      }),
  });
});

const groupTypeExpr = (node: SpecAssemblyNode): string =>
  Array.match(node.children, {
    onEmpty: () =>
      Option.match(node.importBinding, {
        onNone: () =>
          `GroupSpec.GroupSpec<"Convex", "${node.segment}", never, never>`,
        onSome: (binding) => `typeof ${binding.localName}`,
      }),
    onNonEmpty: (children) => {
      const childUnion = pipe(
        children,
        Array.map(rootGroupTypeMember),
        Array.join(" | "),
      );
      return Option.match(node.importBinding, {
        onNone: () =>
          `GroupSpec.GroupSpec<"Convex", "${node.segment}", never, ${childUnion}>`,
        onSome: (binding) =>
          `GroupSpec.AddGroups<typeof ${binding.localName}, ${childUnion}>`,
      });
    },
  });

const rootGroupTypeMember = (node: SpecAssemblyNode): string =>
  `GroupSpec.NamedAt<${groupTypeExpr(node)}, "${node.segment}">`;

export const SCOPED_REFS_HEADER =
  "// Generated by Confect. Group-scoped references. Do not edit.";

export const renderScopedRefs = Effect.fnUntraced(function* (
  node: SpecAssemblyNode,
  path: GroupPath.GroupPath,
): Effect.fn.Return<string> {
  const renameBindings = (
    current: SpecAssemblyNode,
    localName: string,
  ): SpecAssemblyNode => ({
    ...current,
    importBinding: Option.map(current.importBinding, (binding) => ({
      ...binding,
      localName,
    })),
    children: Array.map(current.children, (child, index) =>
      renameBindings(child, `${localName}_${index}`),
    ),
  });
  const scopedNode = renameBindings(node, "declaration_0");
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });
  yield* cbw.writeLine(SCOPED_REFS_HEADER);
  yield* cbw.writeLine(
    scopedNode.children.length > 0 || Option.isNone(scopedNode.importBinding)
      ? 'import { GroupSpec, Refs } from "@confect/core";'
      : 'import { Refs } from "@confect/core";',
  );
  yield* Effect.forEach(collectImportBindings([scopedNode]), (binding) =>
    cbw.writeLine(
      `import ${binding.localName} from "${"../".repeat(path.pathSegments.length)}${binding.importPath}";`,
    ),
  );
  yield* cbw.blankLine();
  yield* cbw.write("const group = ");
  yield* writeGroupAssembly(cbw, scopedNode);
  yield* cbw.write(";\n");
  yield* cbw.write(
    "const refs: Refs.FromGroup<typeof group> = Refs.fromGroup(",
  );
  yield* cbw.quote(Array.join(path.pathSegments, "/"));
  yield* cbw.write(", group);\n");
  yield* cbw.blankLine();
  yield* cbw.writeLine("export default refs;");
  return yield* cbw.toString();
});

export const render = Effect.fnUntraced(function* (
  nodes: ReadonlyArray<SpecAssemblyNode>,
) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  yield* cbw.writeLine(
    Array.match(nodes, {
      onEmpty: () => `import { Spec } from "@confect/core";`,
      onNonEmpty: () => `import { GroupSpec, Spec } from "@confect/core";`,
    }),
  );

  yield* Effect.forEach(collectImportBindings(nodes), (binding) =>
    cbw.writeLine(`import ${binding.localName} from "${binding.importPath}";`),
  );

  yield* cbw.blankLine();

  yield* cbw.write("const spec: ");
  yield* Array.match(nodes, {
    onEmpty: () => cbw.write("Spec.Spec"),
    onNonEmpty: (nonEmptyNodes) =>
      Effect.gen(function* () {
        yield* cbw.write("Spec.Spec<{\n");
        yield* cbw.indent(
          Effect.forEach(nonEmptyNodes, (node) =>
            cbw.writeLine(
              `readonly ${node.segment}: ${rootGroupTypeMember(node)};`,
            ),
          ),
        );
        yield* cbw.write("}>");
      }),
  });
  yield* cbw.write(" = Spec.fromGroups({\n");
  yield* cbw.indent(
    Effect.forEach(nodes, (node) => writeGroupEntry(cbw, node)),
  );
  yield* cbw.writeLine("}) as typeof spec;");
  yield* cbw.blankLine();
  yield* cbw.writeLine(`export default spec;`);

  return yield* cbw.toString();
});
