import type {
  ESTree,
  OxlintScope,
  OxlintSourceCode,
  Variable,
} from "effect-oxlint";
import { Diagnostic, Rule, RuleContext, Visitor } from "effect-oxlint";
import * as Effect from "effect/Effect";

type Api =
  | "effect-it"
  | "plain-it"
  | "effect"
  | "modified"
  | "layer"
  | "effect-namespace"
  | "plain-namespace";

const isFunction = (node: ESTree.Node) =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

const propertyName = (node: ESTree.MemberExpression) =>
  !node.computed && node.property.type === "Identifier"
    ? node.property.name
    : undefined;

const variableAt = (
  source: OxlintSourceCode,
  node: ESTree.BindingIdentifier | ESTree.IdentifierReference,
): Variable | undefined => {
  for (
    let scope: OxlintScope | null = source.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);
    if (variable) return variable;
  }
  return undefined;
};

const unwrap = (node: ESTree.Node): ESTree.Node =>
  node.type === "TSAsExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSNonNullExpression"
    ? unwrap(node.expression)
    : node;

const resolveApi = (
  source: OxlintSourceCode,
  node: ESTree.Node,
  seen = new Set<ESTree.Node>(),
): Api | undefined => {
  if (seen.has(node)) return undefined;
  const next = new Set([...seen, node]);
  if (node.type === "Identifier") {
    const variable = variableAt(source, node);
    if (
      !variable ||
      variable.references.some(
        (reference) => reference.isWrite() && !reference.init,
      )
    )
      return undefined;
    const definition = variable.defs[0];
    if (!definition || variable.defs.length !== 1) return undefined;
    const declaration = definition.node;
    if (
      declaration.type === "ImportSpecifier" ||
      declaration.type === "ImportNamespaceSpecifier"
    ) {
      const parent = declaration.parent;
      if (parent.type !== "ImportDeclaration" || parent.importKind === "type")
        return undefined;
      const effect = parent.source.value === "@effect/vitest";
      if (!effect && parent.source.value !== "vitest") return undefined;
      if (declaration.type === "ImportNamespaceSpecifier")
        return effect ? "effect-namespace" : "plain-namespace";
      if (declaration.importKind === "type") return undefined;
      const name =
        declaration.imported.type === "Identifier"
          ? declaration.imported.name
          : declaration.imported.value;
      if (name === "it") return effect ? "effect-it" : "plain-it";
      if (name === "test") return "plain-it";
      if (name === "layer" && effect) return "layer";
    }
    if (
      declaration.type === "VariableDeclarator" &&
      declaration.id.type === "Identifier" &&
      declaration.init &&
      declaration.parent.type === "VariableDeclaration" &&
      declaration.parent.kind === "const"
    ) {
      return resolveApi(source, declaration.init, next);
    }
    if (
      definition.type === "Parameter" &&
      (declaration.type === "ArrowFunctionExpression" ||
        declaration.type === "FunctionExpression") &&
      declaration.params[0] === definition.name
    ) {
      const call = declaration.parent;
      if (
        call.type === "CallExpression" &&
        call.arguments.at(-1) === declaration &&
        call.callee.type === "CallExpression" &&
        resolveApi(source, call.callee.callee, next) === "layer"
      )
        return "effect-it";
    }
    return undefined;
  }
  if (node.type !== "MemberExpression" || node.optional) return undefined;
  const base = resolveApi(source, node.object, next);
  const name = propertyName(node);
  if (base === "effect-namespace" || base === "plain-namespace") {
    if (name === "it")
      return base === "effect-namespace" ? "effect-it" : "plain-it";
    if (name === "test") return "plain-it";
    if (name === "layer" && base === "effect-namespace") return "layer";
  }
  if (base === "effect-it") {
    if (name === "effect" || name === "live") return "effect";
    if (name === "layer") return "layer";
  }
  if (
    (base === "effect-it" || base === "plain-it" || base === "effect") &&
    (name === "skip" ||
      name === "only" ||
      name === "fails" ||
      name === "concurrent" ||
      name === "sequential")
  )
    return "modified";
  return undefined;
};

const registrationLoop = (
  node: ESTree.CallExpression,
): ESTree.ForOfStatement | ESTree.CallExpression | undefined => {
  for (
    let parent: ESTree.Node | null = node.parent;
    parent;
    parent = parent.parent
  ) {
    if (parent.type === "ForOfStatement") return parent;
    if (isFunction(parent)) {
      const call = parent.parent;
      if (
        call?.type === "CallExpression" &&
        call.arguments[0] === parent &&
        call.callee.type === "MemberExpression" &&
        propertyName(call.callee) === "forEach"
      )
        return call;
      return undefined;
    }
  }
  return undefined;
};

const insideTest = (source: OxlintSourceCode, node: ESTree.Node): boolean => {
  for (
    let parent: ESTree.Node | null = node.parent;
    parent;
    parent = parent.parent
  ) {
    if (!isFunction(parent) || parent.parent?.type !== "CallExpression")
      continue;
    const call = parent.parent;
    const callee =
      call.callee.type === "CallExpression" &&
      call.callee.callee.type === "MemberExpression" &&
      propertyName(call.callee.callee) === "each"
        ? call.callee.callee.object
        : call.callee;
    const api = resolveApi(source, callee);
    if (
      api === "effect" ||
      api === "effect-it" ||
      api === "plain-it" ||
      api === "modified"
    )
      return true;
  }
  return false;
};

const isLiteralData = (node: ESTree.Node): boolean => {
  if (node.type === "Literal")
    return (
      typeof node.value === "string" ||
      typeof node.value === "number" ||
      typeof node.value === "boolean" ||
      node.value === null
    );
  if (node.type === "ArrayExpression")
    return node.elements.every(
      (element) => element !== null && isLiteralData(element),
    );
  if (node.type === "ObjectExpression")
    return node.properties.every(
      (property) =>
        property.type === "Property" &&
        !property.computed &&
        !property.method &&
        property.kind === "init" &&
        isLiteralData(property.value),
    );
  return false;
};

const eachTitle = (
  node: ESTree.Node,
  row: string,
  rows: ESTree.ArrayExpression,
): string | undefined => {
  if (node.type === "Literal" && typeof node.value === "string")
    return /[%$]/.test(node.value) ? undefined : node.value;
  if (node.type !== "TemplateLiteral" || node.expressions.length !== 1)
    return undefined;
  const [expression] = node.expressions;
  const parts = node.quasis.map((quasi) => quasi.value.cooked);
  if (parts.some((part) => part === null || /[%$]/.test(part)))
    return undefined;
  if (
    expression.type === "Identifier" &&
    expression.name === row &&
    rows.elements.every(
      (element) =>
        element?.type === "Literal" && typeof element.value === "string",
    )
  )
    return `${parts[0]}%s${parts[1]}`;
  if (
    expression.type === "MemberExpression" &&
    expression.object.type === "Identifier" &&
    expression.object.name === row
  ) {
    const name = propertyName(expression);
    if (
      name &&
      /^[A-Za-z_]\w*$/.test(name) &&
      name !== "__proto__" &&
      !/^[\w.$]/.test(parts[1] ?? "") &&
      rows.elements.every(
        (element) =>
          element?.type === "ObjectExpression" &&
          element.properties.filter(
            (property) =>
              property.type === "Property" &&
              ((property.key.type === "Identifier" &&
                property.key.name === name) ||
                (property.key.type === "Literal" &&
                  property.key.value === name)),
          ).length === 1 &&
          element.properties.some(
            (property) =>
              property.type === "Property" &&
              property.key.type === "Identifier" &&
              property.key.name === name &&
              property.value.type === "Literal" &&
              typeof property.value.value === "string",
          ),
      )
    )
      return `${parts[0]}$${name}${parts[1]}`;
  }
  return undefined;
};

const replacement = (
  source: OxlintSourceCode,
  loop: ESTree.ForOfStatement | ESTree.CallExpression,
  call: ESTree.CallExpression,
  api: Api,
): string | undefined => {
  if (
    loop.type !== "ForOfStatement" ||
    loop.await ||
    loop.left.type !== "VariableDeclaration" ||
    loop.left.kind !== "const" ||
    loop.left.declarations.length !== 1 ||
    api === "modified"
  )
    return undefined;
  const row = loop.left.declarations[0].id;
  if (row.type !== "Identifier" || row.typeAnnotation) return undefined;
  const statements =
    loop.body.type === "BlockStatement" ? loop.body.body : [loop.body];
  if (
    statements.length !== 1 ||
    statements[0].type !== "ExpressionStatement" ||
    statements[0].expression !== call
  )
    return undefined;
  const rows = unwrap(loop.right);
  if (
    rows.type !== "ArrayExpression" ||
    rows.elements.length === 0 ||
    !isLiteralData(rows)
  )
    return undefined;
  if (
    api !== "effect" &&
    rows.elements.some((element) => element?.type === "ArrayExpression")
  )
    return undefined;
  const [title, callback, timeout] = call.arguments;
  if (
    !title ||
    !callback ||
    callback.type !== "ArrowFunctionExpression" ||
    callback.params.length !== 0 ||
    callback.typeParameters ||
    callback.returnType ||
    call.arguments.length > 3 ||
    (timeout &&
      (timeout.type !== "Literal" || typeof timeout.value !== "number"))
  )
    return undefined;
  const name = eachTitle(title, row.name, rows);
  if (name === undefined || source.getScope(callback).set.has(row.name))
    return undefined;
  const variable = variableAt(source, row);
  if (
    !variable ||
    variable.references.some(
      (reference) => reference.isWrite() && !reference.init,
    )
  )
    return undefined;
  const comments = source
    .getAllComments()
    .filter(
      (comment) =>
        comment.range[0] >= loop.range[0] && comment.range[1] <= loop.range[1],
    );
  if (
    comments.some(
      (comment) =>
        ![loop.right, callback].some(
          (kept) =>
            comment.range[0] >= kept.range[0] &&
            comment.range[1] <= kept.range[1],
        ),
    )
  )
    return undefined;
  const scope = source.getScope(callback);
  if (
    scope.through.some((reference) => reference.identifier.name === "arguments")
  )
    return undefined;
  const opening = source
    .getTokens(callback)
    .find((token) => token.value === "(");
  if (!opening) return undefined;
  const callbackText = source.getText(callback);
  const offset = opening.range[1] - callback.range[0];
  const arrow = `${callbackText.slice(0, offset)}${row.name}${callbackText.slice(offset)}`;
  return `${source.getText(call.callee)}.each(${source.getText(loop.right)})(${JSON.stringify(name)}, ${arrow}${timeout ? `, ${source.getText(timeout)}` : ""});`;
};

export const preferTestEach = Rule.define({
  name: "prefer-test-each",
  meta: Rule.meta({
    type: "suggestion",
    description: "Register parameterized tests with each instead of a loop.",
    fixable: "code",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return Visitor.on("CallExpression", (node) => {
      const api = resolveApi(ctx.sourceCode, node.callee);
      if (
        !api ||
        api === "layer" ||
        api === "effect-namespace" ||
        api === "plain-namespace" ||
        node.optional
      )
        return Effect.void;
      const loop = registrationLoop(node);
      if (!loop || insideTest(ctx.sourceCode, node)) return Effect.void;
      const diagnostic = Diagnostic.make({
        node,
        message:
          "Use test.each to register these cases instead of a loop (Effect each receives the whole row).",
      });
      const text = replacement(ctx.sourceCode, loop, node, api);
      return ctx.report(
        text === undefined
          ? diagnostic
          : Diagnostic.withFix(diagnostic, Diagnostic.replaceText(loop, text)),
      );
    });
  },
});
