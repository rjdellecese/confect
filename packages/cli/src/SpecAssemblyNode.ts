import type { LeafModule } from "./LeafModule";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { CodeBlockWriter } from "./CodeBlockWriter";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Record from "effect/Record";

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
