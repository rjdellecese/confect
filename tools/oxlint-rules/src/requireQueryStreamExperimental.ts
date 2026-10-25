import { Diagnostic, Rule, RuleContext, Visitor } from "effect-oxlint";
import type { ESTree } from "effect-oxlint";
import * as Effect from "effect/Effect";

export const requireQueryStreamExperimental = Rule.define({
  name: "require-query-stream-experimental",
  meta: Rule.meta({
    type: "problem",
    description:
      "Require canonical experimental tags on query-stream exports and overload signatures.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const filename = ctx.filename.replaceAll("\\", "/");
    const isModule = /\/packages\/[^/]+\/src\/QueryStream[^/]*\.ts$/.test(
      filename,
    );
    const isBarrel = /\/packages\/[^/]+\/src\/index\.ts$/.test(filename);

    const check = (
      node:
        | ESTree.ExportNamedDeclaration
        | ESTree.ExportAllDeclaration
        | ESTree.ExportDefaultDeclaration,
    ) => {
      if (node.parent.type !== "Program") return Effect.void;

      if (
        !isModule &&
        !(
          isBarrel &&
          "source" in node &&
          node.source &&
          /^\.\/QueryStream[^/]*$/.test(node.source.value)
        )
      )
        return Effect.void;

      const declaration =
        node.type === "ExportAllDeclaration" ? undefined : node.declaration;
      if (
        declaration?.type === "FunctionDeclaration" &&
        declaration.body &&
        ctx.sourceCode.ast.body.some(
          (statement) =>
            (statement.type === "ExportNamedDeclaration" ||
              statement.type === "ExportDefaultDeclaration") &&
            statement.type === node.type &&
            statement.declaration?.type === "TSDeclareFunction" &&
            statement.declaration.id?.name === declaration.id?.name,
        )
      )
        return Effect.void;

      const comment = ctx.sourceCode.getCommentsBefore(node).at(-1);
      if (
        comment?.type === "Block" &&
        comment.value.startsWith("*") &&
        ctx.sourceCode.text.slice(comment.range[1], node.range[0]).trim() ===
          "" &&
        comment.value
          .split("\n")
          .some(
            (line) => line.replace(/^\s*\*\s?/, "").trim() === "@experimental",
          )
      )
        return Effect.void;

      return ctx.report(
        Diagnostic.make({
          node,
          message:
            "Add a standalone @experimental JSDoc tag to this query-stream export; module prose and other declarations do not cover it.",
        }),
      );
    };
    return Visitor.merge(
      Visitor.on("ExportNamedDeclaration", check),
      Visitor.on("ExportAllDeclaration", check),
      Visitor.on("ExportDefaultDeclaration", check),
    );
  },
});
