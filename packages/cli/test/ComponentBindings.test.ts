import * as ComponentBindings from "@confect/cli/ComponentBindings";
import type { InstalledComponent } from "@confect/cli/ConvexConfig";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as templates from "@confect/cli/templates";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

for (const platform of [
  { name: "POSIX", layer: NodePath.layerPosix, root: "/project" },
  { name: "Windows", layer: NodePath.layerWin32, root: "C:\\project" },
]) {
  layer(platform.layer)(`ComponentBindings on ${platform.name}`, (it) => {
    it.effect.each([false, true])(
      "renders exact component bytes with installed components: %s",
      (installed) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const components: ReadonlyArray<InstalledComponent> = installed
            ? [
                {
                  name: "remote",
                  componentDefinitionPath: "@convex-dev/workpool",
                },
                {
                  name: "local",
                  componentDefinitionPath: path.join(
                    platform.root,
                    "components/local",
                  ),
                },
              ]
            : [];
          const encode = Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown),
          );
          const before = yield* encode(components);
          const rendered = ComponentBindings.renderPlan(
            components,
            path.join(platform.root, "confect"),
          );
          expectTypeOf(rendered).toEqualTypeOf<
            Effect.Effect<
              OutputPlan.OutputPlan,
              OutputPlan.PlanError,
              Path.Path
            >
          >();
          const plan = yield* rendered;
          expect(plan.operations).toEqual([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.Binding({
                relativePath: "components.ts",
              }),
              contents: yield* templates.components({
                components: installed
                  ? [
                      {
                        name: "remote",
                        typeImportPath: "@convex-dev/workpool",
                      },
                      {
                        name: "local",
                        typeImportPath: "../../components/local",
                      },
                    ]
                  : [],
              }),
            }),
          ]);
          expect(yield* encode(components)).toBe(before);
        }),
    );
  });
}
