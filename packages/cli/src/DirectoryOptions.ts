import { IdScope } from "@confect/core";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Flag from "effect/unstable/cli/Flag";
import * as ConfectDirectory from "./ConfectDirectory";
import * as ConvexDirectory from "./ConvexDirectory";
import * as ProjectRoot from "./ProjectRoot";

export const flags = {
  componentDir: Flag.string("component-dir").pipe(
    Flag.withDescription(
      "Generate a component instead of the application; its sibling confect/ directory contains the source.",
    ),
    Flag.optional,
  ),
};

export const layer = ({
  componentDir,
}: {
  componentDir: Option.Option<string>;
}) => {
  const projectRootLayer = Option.match(componentDir, {
    onNone: () => ProjectRoot.layer,
    onSome: (directory) =>
      Layer.effect(
        ProjectRoot.ProjectRoot,
        Effect.map(ProjectRoot.findProjectRootFrom(directory), (root) => ({
          get: Effect.succeed(root),
        })),
      ),
  });
  const convex: Layer.Layer<
    ConvexDirectory.ConvexDirectory,
    Layer.Error<typeof ConvexDirectory.layer> | Schema.SchemaError,
    FileSystem.FileSystem | Path.Path
  > = Option.match(componentDir, {
    onNone: () => ConvexDirectory.layer,
    onSome: (directory) =>
      Layer.effect(
        ConvexDirectory.ConvexDirectory,
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const fs = yield* FileSystem.FileSystem;
          const projectRoot = yield* ProjectRoot.ProjectRoot.get;
          const absolute = path.resolve(directory);
          if (!(yield* fs.exists(path.join(absolute, "convex.config.ts")))) {
            return yield* new ConvexDirectory.ConvexDirectoryNotFoundError();
          }
          const pkg = yield* fs
            .readFileString(path.join(projectRoot, "package.json"))
            .pipe(
              Effect.flatMap(
                Schema.decodeEffect(
                  Schema.fromJsonString(Schema.Struct({ name: Schema.String })),
                ),
              ),
            );
          const definition = `${pkg.name}:${path.relative(projectRoot, absolute).split(path.sep).join("/")}`;
          return {
            get: Effect.succeed(absolute),
            target: {
              kind: "component" as const,
              scope: IdScope.component(definition),
            },
          };
        }),
      ).pipe(Layer.provide(projectRootLayer)),
  });
  return Layer.mergeAll(
    projectRootLayer,
    ConfectDirectory.layerFromConvexDirectory.pipe(Layer.provideMerge(convex)),
  );
};
