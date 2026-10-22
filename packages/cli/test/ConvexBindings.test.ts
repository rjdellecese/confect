import * as ConvexBindings from "@confect/cli/ConvexBindings";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as templates from "@confect/cli/templates";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

for (const platform of [
  { name: "POSIX", layer: NodePath.layerPosix, root: "/workspace" },
  { name: "Windows", layer: NodePath.layerWin32, root: "C:\\workspace" },
]) {
  layer(platform.layer)(`ConvexBindings on ${platform.name}`, (it) => {
    it.effect(
      "renders fixed schema and optional bindings without filesystem observations",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const confect = path.join(platform.root, "backend/confect");
          const convex = path.join(platform.root, "convex");
          const intents = [
            { file: "Http", action: "Write" },
            { file: "Crons", action: "Write" },
            { file: "Auth", action: "Write" },
          ] as const;
          const encode = Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown),
          );
          const before = yield* encode(intents);
          const rendered = ConvexBindings.renderOptionals(
            intents,
            confect,
            convex,
          );
          expectTypeOf(rendered).toEqualTypeOf<
            Effect.Effect<
              OutputPlan.OutputPlan,
              OutputPlan.PlanError,
              Path.Path
            >
          >();
          const plan = yield* rendered;
          const contents = [
            yield* templates.http({
              httpImportPath: "../backend/confect/http",
            }),
            yield* templates.crons({
              cronsImportPath: "../backend/confect/crons",
            }),
            yield* templates.authConfig({
              authImportPath: "../backend/confect/auth",
            }),
          ] as const;
          expect(plan.operations).toEqual([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexBinding({
                relativePath: "http.ts",
              }),
              contents: contents[0],
            }),
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexBinding({
                relativePath: "crons.ts",
              }),
              contents: contents[1],
            }),
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexBinding({
                relativePath: "auth.config.ts",
              }),
              contents: contents[2],
            }),
          ]);
          const schema = yield* ConvexBindings.renderSchema(confect, convex);
          expect(schema.operations).toEqual([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexBinding({
                relativePath: "schema.ts",
              }),
              contents: yield* templates.schema({
                convexSchemaImportPath:
                  "../backend/confect/_generated/convexSchema",
              }),
            }),
          ]);
          expect(yield* encode(intents)).toBe(before);
        }),
    );

    it.effect("only removes explicitly selected optional targets", () =>
      Effect.gen(function* () {
        const empty = yield* ConvexBindings.renderOptionals(
          [],
          "confect",
          "convex",
        );
        expect(empty.operations).toEqual([]);
        const plan = yield* ConvexBindings.renderOptionals(
          [{ file: "Auth", action: "Remove" }],
          "confect",
          "convex",
        );
        expect(plan.operations).toEqual([
          OutputPlan.Operation.Remove({
            target: OutputPlan.Target.ConvexBinding({
              relativePath: "auth.config.ts",
            }),
          }),
        ]);
      }),
    );
  });
}
