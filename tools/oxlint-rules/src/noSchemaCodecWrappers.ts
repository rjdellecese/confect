import type {
  ESTree,
  OxlintScope,
  OxlintSourceCode,
  Variable,
} from "effect-oxlint";
import { Diagnostic, Rule, RuleContext, Visitor } from "effect-oxlint";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as String from "effect/String";

type Api = {
  readonly module: "effect" | "Schema" | "Result" | "Function";
  readonly member?: string;
};

type Codec = {
  readonly method: string;
  readonly arguments: ReadonlyArray<ESTree.Node>;
};

const variableIn = (
  scope: OxlintScope | null,
  name: string,
): Variable | undefined =>
  scope === null
    ? undefined
    : (scope.set.get(name) ?? variableIn(scope.upper, name));

const variableAt = (
  source: OxlintSourceCode,
  node: ESTree.BindingIdentifier | ESTree.IdentifierReference,
) => variableIn(source.getScope(node), node.name);

const constantValue = (
  variable: Variable | undefined,
): ESTree.Node | undefined => {
  if (
    variable === undefined ||
    variable.defs.length !== 1 ||
    Array.some(
      variable.references,
      (reference) => reference.isWrite() && !reference.init,
    )
  )
    return undefined;
  const declaration = variable.defs[0]!.node;
  return declaration.type === "VariableDeclarator" &&
    declaration.id.type === "Identifier" &&
    declaration.parent.type === "VariableDeclaration" &&
    declaration.parent.kind === "const"
    ? (declaration.init ?? undefined)
    : undefined;
};

const resolveApi = (
  source: OxlintSourceCode,
  node: ESTree.Node,
  seen: ReadonlyArray<ESTree.Node> = [],
): Api | undefined => {
  if (Array.contains(seen, node)) return undefined;
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    !node.optional &&
    node.property.type === "Identifier"
  ) {
    const base = resolveApi(source, node.object, [...seen, node]);
    if (base === undefined || base.member !== undefined) return undefined;
    if (base.module === "effect") {
      const name = node.property.name;
      return name === "Schema" || name === "Result" || name === "Function"
        ? { module: name }
        : name === "pipe"
          ? { module: "Function", member: "pipe" }
          : undefined;
    }
    return { module: base.module, member: node.property.name };
  }
  if (node.type !== "Identifier") return undefined;
  const variable = variableAt(source, node);
  if (
    variable === undefined ||
    variable.defs.length !== 1 ||
    Array.some(
      variable.references,
      (reference) => reference.isWrite() && !reference.init,
    )
  )
    return undefined;
  const declaration = variable.defs[0]!.node;
  if (
    declaration.type === "ImportSpecifier" ||
    declaration.type === "ImportNamespaceSpecifier"
  ) {
    const parent = declaration.parent;
    if (parent.type !== "ImportDeclaration" || parent.importKind === "type")
      return undefined;
    const module =
      parent.source.value === "effect"
        ? "effect"
        : parent.source.value === "effect/Schema"
          ? "Schema"
          : parent.source.value === "effect/Result"
            ? "Result"
            : parent.source.value === "effect/Function"
              ? "Function"
              : undefined;
    if (module === undefined) return undefined;
    if (declaration.type === "ImportNamespaceSpecifier") return { module };
    if (declaration.importKind === "type") return undefined;
    const name =
      declaration.imported.type === "Identifier"
        ? declaration.imported.name
        : declaration.imported.value;
    if (module === "effect") {
      return name === "Schema" || name === "Result" || name === "Function"
        ? { module: name }
        : name === "pipe"
          ? { module: "Function", member: "pipe" }
          : undefined;
    }
    return { module, member: name };
  }
  const value = constantValue(variable);
  return value === undefined
    ? undefined
    : resolveApi(source, value, [...seen, node]);
};

const codecFactory = (
  source: OxlintSourceCode,
  node: ESTree.Node,
  seen: ReadonlyArray<ESTree.Node> = [],
): Codec | undefined => {
  if (Array.contains(seen, node)) return undefined;
  if (node.type === "Identifier") {
    const value = constantValue(variableAt(source, node));
    return value === undefined
      ? undefined
      : codecFactory(source, value, [...seen, node]);
  }
  if (
    node.type !== "CallExpression" ||
    node.optional ||
    Array.some(node.arguments, (argument) => argument.type === "SpreadElement")
  )
    return undefined;
  const api = resolveApi(source, node.callee);
  return api?.module === "Schema" &&
    api.member !== undefined &&
    /^(?:decode|encode)(?:Unknown)?(?:Sync|Effect|Promise|Option|Result)?$/.test(
      api.member,
    )
    ? { method: api.member, arguments: node.arguments }
    : undefined;
};

const isApi = (
  source: OxlintSourceCode,
  node: ESTree.Node,
  module: Api["module"],
  member: string,
) => {
  const api = resolveApi(source, node);
  return api?.module === module && api.member === member;
};

const codecCall = (
  source: OxlintSourceCode,
  node: ESTree.Node,
): Codec | undefined => {
  if (
    node.type !== "CallExpression" ||
    node.optional ||
    Array.some(node.arguments, (argument) => argument.type === "SpreadElement")
  )
    return undefined;
  const factory = codecFactory(source, node.callee);
  if (factory !== undefined)
    return { ...factory, arguments: [...factory.arguments, ...node.arguments] };
  if (
    isApi(source, node.callee, "Function", "pipe") &&
    (node.arguments.length === 2 ||
      (node.arguments.length === 3 &&
        isApi(source, node.arguments[2]!, "Result", "getOrThrow")))
  ) {
    const pipedFactory = codecFactory(source, node.arguments[1]!);
    if (
      pipedFactory !== undefined &&
      (node.arguments.length === 2 ||
        String.endsWith("Result")(pipedFactory.method))
    ) {
      return {
        ...pipedFactory,
        arguments: [...pipedFactory.arguments, node.arguments[0]!],
      };
    }
  }
  return codecFactory(source, node);
};

const wrappedCodec = (
  source: OxlintSourceCode,
  node: ESTree.Node,
): Codec | undefined => {
  const direct = codecCall(source, node);
  if (direct !== undefined) return direct;
  if (node.type !== "CallExpression" || node.optional) return undefined;
  const unwrapped =
    node.arguments.length === 1 &&
    isApi(source, node.callee, "Result", "getOrThrow")
      ? codecCall(source, node.arguments[0]!)
      : node.arguments.length === 2 &&
          isApi(source, node.callee, "Function", "pipe") &&
          isApi(source, node.arguments[1]!, "Result", "getOrThrow")
        ? codecCall(source, node.arguments[0]!)
        : node.callee.type === "MemberExpression" &&
            !node.callee.computed &&
            !node.callee.optional &&
            node.callee.property.type === "Identifier" &&
            node.callee.property.name === "pipe" &&
            node.arguments.length === 1 &&
            isApi(source, node.arguments[0]!, "Result", "getOrThrow")
          ? codecCall(source, node.callee.object)
          : undefined;
  return unwrapped !== undefined && String.endsWith("Result")(unwrapped.method)
    ? unwrapped
    : undefined;
};

export const noSchemaCodecWrappers = Rule.define({
  name: "no-schema-codec-wrappers",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use Schema decoding and encoding APIs directly instead of thin forwarding functions.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const check = (node: ESTree.Node) => {
      if (
        node.type !== "ArrowFunctionExpression" &&
        node.type !== "FunctionExpression" &&
        node.type !== "FunctionDeclaration"
      )
        return Effect.void;
      if (
        node.type !== "FunctionDeclaration" &&
        !(
          node.parent.type === "VariableDeclarator" &&
          node.parent.id.type === "Identifier" &&
          node.parent.init === node
        ) &&
        !(
          node.parent.type === "ExportDefaultDeclaration" &&
          node.parent.declaration === node
        )
      )
        return Effect.void;
      if (
        node.async ||
        (node.type !== "ArrowFunctionExpression" && node.generator) ||
        node.body == null ||
        node.params.length === 0
      )
        return Effect.void;
      const expression =
        node.body.type !== "BlockStatement"
          ? node.body
          : node.body.body.length === 1 &&
              node.body.body[0]?.type === "ReturnStatement"
            ? node.body.body[0].argument
            : undefined;
      if (expression == null) return Effect.void;
      const codec = wrappedCodec(ctx.sourceCode, expression);
      if (
        codec === undefined ||
        !Array.every(node.params, (parameter) => {
          if (parameter.type !== "Identifier") return false;
          const variable = variableAt(ctx.sourceCode, parameter);
          return (
            variable !== undefined &&
            variable.references.length === 1 &&
            Array.contains(codec.arguments, variable.references[0]!.identifier)
          );
        })
      )
        return Effect.void;
      return ctx.report(
        Diagnostic.make({
          node,
          message: `Use Schema.${codec.method} directly instead of wrapping it in a forwarding function. Keep any Result.getOrThrow at the call site.`,
        }),
      );
    };
    return Visitor.merge(
      Visitor.on("ArrowFunctionExpression", check),
      Visitor.on("FunctionExpression", check),
      Visitor.on("FunctionDeclaration", check),
    );
  },
});
